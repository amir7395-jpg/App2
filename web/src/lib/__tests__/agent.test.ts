import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { runAgentTurn, type CreateMessage } from "../agent/engine";
import { startSimulation } from "../calls";
import { appointments, callMessages, calls, invoices, leads } from "../db/schema";
import { addInvoice, addLead, fakeTelephony, MONDAY_2PM, setup } from "./helpers";

type Block = BetaMessage["content"][number];

function message(content: unknown[], stop: BetaMessage["stop_reason"]): BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "test", content: content as Block[], stop_reason: stop } as BetaMessage;
}
const text = (t: string) => ({ type: "text", text: t, citations: null });
const use = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

/** Replays a fixed script of Claude responses and records each request it receives. */
function scripted(responses: ((req: MessageCreateParamsNonStreaming) => BetaMessage)[]) {
  const requests: MessageCreateParamsNonStreaming[] = [];
  const create: CreateMessage = async (req) => {
    requests.push(structuredClone(req));
    const next = responses.shift();
    if (!next) throw new Error("script exhausted");
    return next(req);
  };
  return { create, requests };
}

describe("agent engine – lead call", () => {
  it("checks availability, books the chosen slot and ends the call", async () => {
    const { db, business } = setup();
    const lead = addLead(db, business.id);
    const call = startSimulation(db, business, { lead });
    const { telephony } = fakeTelephony();
    let offered = "";

    const script = scripted([
      () => message([text("Hi Jane, this is Alex, an AI assistant calling for Acme Plumbing. Still need help?")], "end_turn"),
      () => message([use("t1", "check_availability", {})], "tool_use"),
      (req) => {
        const last = req.messages.at(-1)!.content as { type: string; content: string }[];
        offered = JSON.parse(last[0].content).slots[0].start;
        return message([use("t2", "book_appointment", { start: offered, notes: "Leaky faucet" })], "tool_use");
      },
      () => message([text("You're booked. Bye!"), use("t3", "end_call", { summary: "Booked a visit." })], "tool_use"),
    ]);

    const first = await runAgentTurn({
      db, callId: call.id, opening: true, telephony, createMessage: script.create, now: MONDAY_2PM,
    });
    expect(first.ended).toBe(false);
    expect(first.reply).toBe(
      "Hi, this is an automated call from an AI assistant named Alex, calling on behalf of Acme Plumbing. " +
        "Hi Jane, this is Alex, an AI assistant calling for Acme Plumbing. Still need help?",
    );
    // The model is told the disclosure was already spoken.
    expect(script.requests[0].messages[0].content).toContain("This was just said to them");

    const second = await runAgentTurn({
      db, callId: call.id, contactSaid: "Yes, the first time works.", telephony, createMessage: script.create, now: MONDAY_2PM,
    });
    expect(second.ended).toBe(true);
    expect(second.reply).toBe("You're booked. Bye!");

    const appt = db.select().from(appointments).get()!;
    expect(appt.startsAt.toISOString()).toBe(offered);
    expect(appt.bookedBy).toBe("agent");
    // No extra model round trip after end_call.
    expect(script.requests).toHaveLength(4);
    expect(db.select().from(leads).where(eq(leads.id, lead.id)).get()!.status).toBe("appointment_set");

    const saved = db.select().from(calls).where(eq(calls.id, call.id)).get()!;
    expect(saved.ended).toBe(true);
    expect(saved.outcome).toContain("Booked a visit.");
    // History is append-only: every request starts with the exact previous history.
    for (let i = 1; i < script.requests.length; i++) {
      const prev = script.requests[i - 1].messages;
      expect(script.requests[i].messages.slice(0, prev.length)).toEqual(prev);
    }
    expect(script.requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low" } });

    const transcript = db.select().from(callMessages).where(eq(callMessages.callId, call.id)).all();
    expect(transcript.map((m) => m.role)).toEqual(["agent", "contact", "event", "agent"]);
  });

  it("returns tool errors to Claude instead of crashing (e.g. booking outside hours)", async () => {
    const { db, business } = setup();
    const lead = addLead(db, business.id);
    const call = startSimulation(db, business, { lead });
    let errorSeen = "";
    const script = scripted([
      () => message([use("t1", "book_appointment", { start: "2026-10-25T15:00:00Z" })], "tool_use"), // Sunday
      (req) => {
        const r = (req.messages.at(-1)!.content as { is_error: boolean; content: string }[])[0];
        errorSeen = r.is_error ? r.content : "";
        return message([text("Sorry, that day we're closed.")], "end_turn");
      },
    ]);
    const res = await runAgentTurn({
      db, callId: call.id, contactSaid: "Book me Sunday", telephony: fakeTelephony().telephony, createMessage: script.create, now: MONDAY_2PM,
    });
    expect(errorSeen).toMatch(/outside business hours/);
    expect(res.reply).toBe("Sorry, that day we're closed.");
    expect(db.select().from(appointments).all()).toHaveLength(0);
  });

  it("ends the call gracefully when the API fails", async () => {
    const { db, business } = setup();
    const call = startSimulation(db, business, { lead: addLead(db, business.id) });
    const res = await runAgentTurn({
      db, callId: call.id, contactSaid: "hello", telephony: fakeTelephony().telephony,
      createMessage: async () => { throw new Error("boom"); },
    });
    expect(res.ended).toBe(true);
    expect(db.select().from(calls).get()!.outcome).toMatch(/Agent error/);
  });
});

describe("AI disclosure", () => {
  const DISCLOSURE = "Hi, this is an automated call from an AI assistant named Alex, calling on behalf of Acme Plumbing.";

  it("is always the first thing said, whatever the model replies", async () => {
    const { db, business } = setup();
    const call = startSimulation(db, business, { invoice: addInvoice(db, business.id) });
    const script = scripted([() => message([text("Am I speaking with Bob Smith?")], "end_turn")]);
    const res = await runAgentTurn({ db, callId: call.id, opening: true, telephony: fakeTelephony().telephony, createMessage: script.create });
    expect(res.reply).toBe(`${DISCLOSURE} Am I speaking with Bob Smith?`);
    const transcript = db.select().from(callMessages).where(eq(callMessages.callId, call.id)).all();
    expect(transcript[0]).toMatchObject({ role: "agent", content: res.reply });
  });

  it("is still spoken when the AI request fails", async () => {
    const { db, business } = setup();
    const call = startSimulation(db, business, { lead: addLead(db, business.id) });
    const res = await runAgentTurn({
      db, callId: call.id, opening: true, telephony: fakeTelephony().telephony,
      createMessage: async () => { throw new Error("down"); },
    });
    expect(res.reply.startsWith(DISCLOSURE)).toBe(true);
    expect(res.ended).toBe(true);
  });

  it("is in the voicemail message too", async () => {
    const { business } = setup();
    const { voicemailScript } = await import("../agent/prompts");
    expect(voicemailScript(business, "invoice", "Bob")).toContain(DISCLOSURE);
    expect(voicemailScript(business, "lead", "Jane")).toContain(DISCLOSURE);
  });
});

describe("agent engine – invoice call", () => {
  it("records a payment promise and texts the payment link on phone calls", async () => {
    const { db, business } = setup();
    const invoice = addInvoice(db, business.id);
    const call = startSimulation(db, business, { invoice });
    db.update(calls).set({ mode: "phone" }).where(eq(calls.id, call.id)).run();
    const { telephony, texts } = fakeTelephony();
    const script = scripted([
      () => message([use("a", "record_payment_promise", { pay_by: "2026-10-23" }), use("b", "send_payment_link", {})], "tool_use"),
      () => message([text("Great, I've texted you the link. Thanks Bob!")], "end_turn"),
    ]);
    const res = await runAgentTurn({
      db, callId: call.id, contactSaid: "I'll pay Friday, send me the link", telephony, createMessage: script.create, now: MONDAY_2PM,
    });
    expect(res.reply).toContain("texted you the link");
    const inv = db.select().from(invoices).get()!;
    expect(inv.status).toBe("promised");
    expect(inv.promisedPayDate!.toISOString()).toBe("2026-10-23T04:00:00.000Z");
    expect(texts).toEqual([{ to: "+15557654321", body: expect.stringContaining("https://pay.example.com/acme") }]);
    // Both tool results go back in a single user message.
    const toolResults = script.requests[1].messages.at(-1)!.content as unknown[];
    expect(toolResults).toHaveLength(2);
  });

  it("system prompt carries the invoice facts and forbids threats", async () => {
    const { db, business } = setup();
    const call = startSimulation(db, business, { invoice: addInvoice(db, business.id) });
    const script = scripted([() => message([text("Hi, is this Bob?")], "end_turn")]);
    await runAgentTurn({ db, callId: call.id, opening: true, telephony: fakeTelephony().telephony, createMessage: script.create });
    const system = script.requests[0].system as string;
    expect(system).toContain("$450.00");
    expect(system).toContain("INV-1001");
    expect(system).toMatch(/Never threaten/);
    expect(script.requests[0].tools!.map((t) => (t as { name: string }).name)).toEqual([
      "record_payment_promise", "send_payment_link", "flag_for_owner", "end_call",
    ]);
  });
});
