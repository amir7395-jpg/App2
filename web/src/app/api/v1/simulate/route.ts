import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls, invoices, leads } from "@/lib/db/schema";
import { body, HttpError, json, requireSubscriber, route } from "@/lib/http";
import { startSimulation } from "@/lib/calls";
import { runAgentTurn } from "@/lib/agent/engine";
import { nullTelephony } from "@/lib/telephony";
import { agentEnabled } from "@/lib/config";

const Input = z.union([
  z.object({ leadId: z.string() }),
  z.object({ invoiceId: z.string() }),
  z.object({ callId: z.string(), message: z.string().trim().min(1).max(2000) }),
]);

/**
 * Practice conversation in the browser: you play the lead or customer and type replies.
 * Runs the real agent and tools (bookings and status changes are saved) but never dials or texts anyone.
 */
export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  if (!agentEnabled()) throw new HttpError(503, "The AI agent is not configured on this server (ANTHROPIC_API_KEY)");
  const input = await body(req, Input);
  const db = getDb();

  if ("callId" in input) {
    const call = db.select().from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, business.id))).get();
    if (!call || call.mode !== "simulation") throw new HttpError(404, "Simulation not found");
    const turn = await runAgentTurn({ db, callId: call.id, contactSaid: input.message, telephony: nullTelephony });
    return json({ callId: call.id, ...turn });
  }

  const lead = "leadId" in input
    ? db.select().from(leads).where(and(eq(leads.id, input.leadId), eq(leads.businessId, business.id))).get()
    : undefined;
  const invoice = "invoiceId" in input
    ? db.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, business.id))).get()
    : undefined;
  if (!lead && !invoice) throw new HttpError(404, "Lead or invoice not found");
  const call = startSimulation(db, business, { lead, invoice });
  const turn = await runAgentTurn({ db, callId: call.id, opening: true, telephony: nullTelephony });
  return json({ callId: call.id, ...turn }, 201);
});
