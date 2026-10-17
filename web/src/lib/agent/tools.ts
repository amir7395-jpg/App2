import { z } from "zod";
import { eq } from "drizzle-orm";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { DB } from "../db";
import { appointments, invoices, leads, type Business, type Call, type Invoice, type Lead } from "../db/schema";
import { findOpenSlots, isWithinBusinessHours, overlapsExisting } from "../availability";
import { DAY, formatInZone, wallClock, zonedTimeToUtc } from "../time";
import type { Telephony } from "../telephony";
import { config } from "../config";

export interface ToolContext {
  db: DB;
  business: Business;
  call: Call;
  lead?: Lead;
  invoice?: Invoice;
  now: Date;
  telephony: Telephony;
  /** Set by end_call; the engine hangs up after speaking the final reply. */
  endRequested?: { summary: string };
  events: string[];
}

interface AgentTool<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<unknown> | unknown;
}

const tool = <S extends z.ZodType>(t: AgentTool<S>) => t;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

function parseLocalDate(value: string, tz: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, 0, 0, tz);
}

const fromNumber = (b: Business) => b.callerId || config.twilioFromNumber;

async function sms(ctx: ToolContext, to: string | null | undefined, body: string) {
  if (!to) return;
  try {
    await ctx.telephony.sendSms({ to, from: fromNumber(ctx.business), body });
  } catch (err) {
    console.error("SMS failed", err);
  }
}

// ---------- shared ----------

const endCall = tool({
  name: "end_call",
  description:
    "Hang up after your current reply. Call this once the conversation is finished (goodbye said, " +
    "wrong number, or the person asks to stop). Your text in this turn is spoken before hanging up.",
  schema: z.object({
    summary: z.string().describe("One or two sentences for the business owner describing how the call went."),
  }),
  run(input, ctx) {
    ctx.endRequested = { summary: input.summary };
    return { ok: true };
  },
});

// ---------- lead calls ----------

const checkAvailability = tool({
  name: "check_availability",
  description:
    "List open appointment slots. Always call this before offering times; never invent availability. " +
    "Optionally pass a date the person asked for.",
  schema: z.object({ date: isoDate.optional().describe("Local date to search from, YYYY-MM-DD") }),
  run(input, ctx) {
    const from = input.date ? parseLocalDate(input.date, ctx.business.timezone) : ctx.now;
    const slots = findOpenSlots(ctx.db, ctx.business, {
      from: from < ctx.now ? ctx.now : from,
      days: input.date ? 3 : 7,
      limit: 6,
      now: ctx.now,
    });
    return {
      timezone: ctx.business.timezone,
      slots: slots.map((s) => ({ start: s.start.toISOString(), label: formatInZone(s.start, ctx.business.timezone) })),
    };
  },
});

const bookAppointment = tool({
  name: "book_appointment",
  description:
    "Book an appointment once the person has agreed to a specific slot returned by check_availability. " +
    "Read the confirmed day and time back to them after booking.",
  schema: z.object({
    start: z.string().describe("The exact `start` value of the chosen slot from check_availability"),
    notes: z.string().default("").describe("What the appointment is about, anything the owner should know"),
  }),
  async run(input, ctx) {
    const lead = ctx.lead;
    if (!lead) throw new Error("No lead on this call");
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new Error("start must be an ISO timestamp from check_availability");
    const end = new Date(start.getTime() + ctx.business.appointmentMinutes * 60_000);
    if (start <= ctx.now) throw new Error("That time is in the past");
    if (!isWithinBusinessHours(ctx.business, start, end)) throw new Error("That time is outside business hours");
    if (overlapsExisting(ctx.db, ctx.business.id, start, end)) {
      throw new Error("That slot was just taken; call check_availability again");
    }
    const appt = ctx.db
      .insert(appointments)
      .values({
        businessId: ctx.business.id,
        leadId: lead.id,
        title: `Appointment with ${lead.name}`,
        startsAt: start,
        endsAt: end,
        notes: input.notes,
        bookedBy: "agent",
      })
      .returning()
      .get();
    ctx.db
      .update(leads)
      .set({ status: "appointment_set", nextFollowUpAt: null })
      .where(eq(leads.id, lead.id))
      .run();
    const when = formatInZone(start, ctx.business.timezone);
    ctx.events.push(`Booked appointment for ${when}`);
    if (ctx.call.mode === "phone") {
      await sms(ctx, lead.phone, `${ctx.business.name}: you're booked for ${when}. Reply to this message if you need to change it.`);
      await sms(ctx, ctx.business.ownerPhone, `New appointment booked by your AI agent: ${lead.name} (${lead.phone}) on ${when}.`);
    }
    return { booked: true, appointmentId: appt.id, when };
  },
});

const updateLead = tool({
  name: "update_lead",
  description:
    "Record the outcome when no appointment is booked: the person wants a call back later, is not interested, " +
    "asks never to be called again, or it is a wrong number.",
  schema: z.object({
    outcome: z.enum(["call_back_later", "not_interested", "do_not_call", "wrong_number"]),
    callback_date: isoDate.optional().describe("If they asked to be called back on a specific local date"),
    notes: z.string().default(""),
  }),
  run(input, ctx) {
    const lead = ctx.lead;
    if (!lead) throw new Error("No lead on this call");
    const patch: Partial<Lead> = {};
    if (input.outcome === "call_back_later") {
      patch.status = "follow_up";
      if (input.callback_date) {
        const day = parseLocalDate(input.callback_date, ctx.business.timezone);
        const w = wallClock(day, ctx.business.timezone);
        patch.nextFollowUpAt = zonedTimeToUtc(w.year, w.month, w.day, 10, 0, ctx.business.timezone);
      } else {
        patch.nextFollowUpAt = new Date(ctx.now.getTime() + ctx.business.leadFollowUpHours * 3_600_000);
      }
    } else if (input.outcome === "not_interested") {
      patch.status = "not_interested";
      patch.nextFollowUpAt = null;
    } else {
      patch.status = "do_not_call";
      patch.consent = false;
      patch.nextFollowUpAt = null;
    }
    if (input.notes) patch.notes = [lead.notes, input.notes].filter(Boolean).join("\n");
    ctx.db.update(leads).set(patch).where(eq(leads.id, lead.id)).run();
    ctx.events.push(`Lead marked ${patch.status}`);
    return { ok: true, status: patch.status };
  },
});

// ---------- invoice calls ----------

const recordPaymentPromise = tool({
  name: "record_payment_promise",
  description: "Record that the customer committed to pay by a specific date (optionally a partial amount).",
  schema: z.object({
    pay_by: isoDate,
    amount_dollars: z.number().positive().optional().describe("Omit if they will pay the full balance"),
    notes: z.string().default(""),
  }),
  run(input, ctx) {
    const invoice = ctx.invoice;
    if (!invoice) throw new Error("No invoice on this call");
    const payBy = parseLocalDate(input.pay_by, ctx.business.timezone);
    if (payBy.getTime() < ctx.now.getTime() - DAY) throw new Error("pay_by is in the past");
    const note = `Promised to pay ${input.amount_dollars ? `$${input.amount_dollars.toFixed(2)}` : "in full"} by ${input.pay_by}. ${input.notes}`.trim();
    ctx.db
      .update(invoices)
      .set({ status: "promised", promisedPayDate: payBy, notes: [invoice.notes, note].filter(Boolean).join("\n") })
      .where(eq(invoices.id, invoice.id))
      .run();
    ctx.events.push(note);
    return { ok: true };
  },
});

const sendPaymentLink = tool({
  name: "send_payment_link",
  description: "Text the customer the business's online payment link. Only call this if they agree to receive a text.",
  schema: z.object({}),
  async run(_input, ctx) {
    const invoice = ctx.invoice;
    if (!invoice) throw new Error("No invoice on this call");
    if (!ctx.business.paymentLink) return { sent: false, reason: "The business has not set up a payment link" };
    if (ctx.call.mode === "phone") {
      await sms(
        ctx,
        invoice.customerPhone,
        `${ctx.business.name}: pay invoice ${invoice.invoiceNumber} here: ${ctx.business.paymentLink}`,
      );
    }
    ctx.events.push("Payment link sent by SMS");
    return { sent: true };
  },
});

const flagInvoice = tool({
  name: "flag_for_owner",
  description:
    "Escalate to the business owner instead of continuing to collect: the customer says they already paid, " +
    "disputes the charge, reports financial hardship, is not the right person, or asks not to be called again.",
  schema: z.object({
    reason: z.enum(["already_paid", "dispute", "hardship", "wrong_person", "do_not_call"]),
    notes: z.string().default(""),
  }),
  async run(input, ctx) {
    const invoice = ctx.invoice;
    if (!invoice) throw new Error("No invoice on this call");
    const patch: Partial<Invoice> = {
      notes: [invoice.notes, `Flagged (${input.reason}): ${input.notes}`].filter(Boolean).join("\n"),
    };
    if (input.reason === "already_paid" || input.reason === "dispute") patch.status = "disputed";
    if (input.reason === "do_not_call" || input.reason === "wrong_person") patch.consent = false;
    ctx.db.update(invoices).set(patch).where(eq(invoices.id, invoice.id)).run();
    ctx.events.push(`Invoice flagged: ${input.reason}`);
    if (ctx.call.mode === "phone") {
      await sms(
        ctx,
        ctx.business.ownerPhone,
        `Invoice ${invoice.invoiceNumber} (${invoice.customerName}) needs your attention: ${input.reason.replace("_", " ")}. ${input.notes}`,
      );
    }
    return { ok: true };
  },
});

export const LEAD_TOOLS = [checkAvailability, bookAppointment, updateLead, endCall];
export const INVOICE_TOOLS = [recordPaymentPromise, sendPaymentLink, flagInvoice, endCall];

type AnyTool = AgentTool<z.ZodType>;

export function toolsFor(purpose: Call["purpose"]): AnyTool[] {
  return (purpose === "lead" ? LEAD_TOOLS : INVOICE_TOOLS) as unknown as AnyTool[];
}

export function toApiTools(tools: AnyTool[]): BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema, { io: "input" }) as BetaTool["input_schema"],
  }));
}

export async function executeTool(
  tools: AnyTool[],
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<{ content: string; isError: boolean }> {
  const t = tools.find((x) => x.name === name);
  if (!t) return { content: `Unknown tool ${name}`, isError: true };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  try {
    return { content: JSON.stringify(await t.run(parsed.data, ctx)), isError: false };
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}
