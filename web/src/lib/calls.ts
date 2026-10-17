import { eq } from "drizzle-orm";
import type { DB } from "./db";
import { businesses, calls, invoices, leads, type Business, type Call, type Invoice, type Lead } from "./db/schema";
import { config } from "./config";
import { isWithinCallingWindow } from "./compliance";
import type { Telephony } from "./telephony";
import { HOUR } from "./time";

export class CallNotAllowed extends Error {}

const ACTIVE_LEAD_STATUSES: Lead["status"][] = ["new", "contacted", "follow_up"];

export function assertCanCallLead(business: Business, lead: Lead, now: Date) {
  if (!lead.consent) throw new CallNotAllowed("This lead has not consented to automated calls");
  if (lead.status === "do_not_call") throw new CallNotAllowed("This lead asked not to be called");
  if (!isWithinCallingWindow(business, now)) throw new CallNotAllowed("Outside calling hours (9am–8pm business time)");
}

export function assertCanCallInvoice(business: Business, invoice: Invoice, now: Date) {
  if (!invoice.consent) throw new CallNotAllowed("This customer has not consented to automated calls");
  if (invoice.status === "paid" || invoice.status === "written_off") throw new CallNotAllowed("Invoice is closed");
  if (!invoice.customerPhone) throw new CallNotAllowed("This customer has no phone number in QuickBooks");
  if (!isWithinCallingWindow(business, now)) throw new CallNotAllowed("Outside calling hours (9am–8pm business time)");
}

/** Places a real outbound phone call through Twilio. Twilio then drives the conversation via webhooks. */
export async function startPhoneCall(opts: {
  db: DB;
  business: Business;
  telephony: Telephony;
  now?: Date;
  lead?: Lead;
  invoice?: Invoice;
}): Promise<Call> {
  const { db, business, lead, invoice } = opts;
  const now = opts.now ?? new Date();
  if (lead) assertCanCallLead(business, lead, now);
  else if (invoice) assertCanCallInvoice(business, invoice, now);
  else throw new Error("startPhoneCall needs a lead or an invoice");

  const call = db
    .insert(calls)
    .values({
      businessId: business.id,
      purpose: lead ? "lead" : "invoice",
      leadId: lead?.id,
      invoiceId: invoice?.id,
      toPhone: lead ? lead.phone : invoice!.customerPhone!,
      mode: "phone",
      status: "queued",
      startedAt: now,
    })
    .returning()
    .get();

  if (lead) {
    db.update(leads)
      .set({ attempts: lead.attempts + 1, lastContactedAt: now, nextFollowUpAt: null })
      .where(eq(leads.id, lead.id))
      .run();
  } else {
    db.update(invoices)
      .set({ collectionAttempts: invoice!.collectionAttempts + 1, lastCollectionAt: now })
      .where(eq(invoices.id, invoice!.id))
      .run();
  }

  try {
    const { sid } = await opts.telephony.placeCall({
      to: call.toPhone,
      from: business.callerId || config.twilioFromNumber,
      callId: call.id,
    });
    db.update(calls).set({ twilioCallSid: sid }).where(eq(calls.id, call.id)).run();
    return { ...call, twilioCallSid: sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(calls)
      .set({ status: "failed", ended: true, endedAt: now, outcome: `Could not place call: ${message}` })
      .where(eq(calls.id, call.id))
      .run();
    // Don't burn an attempt on our own failure; retry at the next follow-up window.
    if (lead) {
      db.update(leads)
        .set({ attempts: lead.attempts, nextFollowUpAt: new Date(now.getTime() + HOUR) })
        .where(eq(leads.id, lead.id))
        .run();
    }
    throw err;
  }
}

/** A browser-based test conversation that runs the same agent without dialling anyone. */
export function startSimulation(db: DB, business: Business, subject: { lead?: Lead; invoice?: Invoice }): Call {
  const { lead, invoice } = subject;
  return db
    .insert(calls)
    .values({
      businessId: business.id,
      purpose: lead ? "lead" : "invoice",
      leadId: lead?.id,
      invoiceId: invoice?.id,
      toPhone: lead?.phone ?? invoice!.customerPhone ?? "(no phone)",
      mode: "simulation",
      status: "in_progress",
      startedAt: new Date(),
    })
    .returning()
    .get();
}

/** Map Twilio's final call status onto our call + follow-up bookkeeping. */
export function completeCall(
  db: DB,
  callId: string,
  twilio: { callStatus: string; answeredBy?: string; durationSeconds?: number },
  now = new Date(),
) {
  const call = db.select().from(calls).where(eq(calls.id, callId)).get();
  if (!call) return;

  const machine = twilio.answeredBy?.startsWith("machine") ?? false;
  let status: Call["status"] = call.status;
  if (twilio.callStatus === "completed") status = machine ? "voicemail" : "completed";
  else if (twilio.callStatus === "busy" || twilio.callStatus === "no-answer" || twilio.callStatus === "canceled")
    status = "no_answer";
  else if (twilio.callStatus === "failed") status = "failed";

  db.update(calls)
    .set({ status, ended: true, endedAt: now, outcome: call.outcome ?? describe(status) })
    .where(eq(calls.id, callId))
    .run();

  if (call.leadId) {
    const lead = db.select().from(leads).where(eq(leads.id, call.leadId)).get();
    const business = db.select().from(businesses).where(eq(businesses.id, call.businessId)).get();
    if (lead && business && ACTIVE_LEAD_STATUSES.includes(lead.status)) {
      const reachedPerson = status === "completed";
      const outOfAttempts = lead.attempts >= business.leadMaxAttempts;
      db.update(leads)
        .set(
          !reachedPerson && outOfAttempts
            ? { status: "unreachable", nextFollowUpAt: null }
            : {
                status: lead.status === "new" ? "contacted" : lead.status,
                // Respect a callback time the agent already set during the call.
                nextFollowUpAt:
                  lead.nextFollowUpAt ?? (outOfAttempts ? null : new Date(now.getTime() + business.leadFollowUpHours * HOUR)),
              },
        )
        .where(eq(leads.id, lead.id))
        .run();
    }
  }
}

function describe(status: Call["status"]) {
  switch (status) {
    case "voicemail":
      return "Reached voicemail; left a message";
    case "no_answer":
      return "No answer";
    case "failed":
      return "Call failed";
    default:
      return null;
  }
}
