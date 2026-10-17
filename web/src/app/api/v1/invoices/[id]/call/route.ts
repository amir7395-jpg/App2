import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { HttpError, json, requireSubscriber, route } from "@/lib/http";
import { CallNotAllowed, startPhoneCall } from "@/lib/calls";
import { defaultTelephony } from "@/lib/telephony";
import { agentEnabled, telephonyEnabled } from "@/lib/config";
import { publicCall } from "@/lib/serialize";

/** "Remind now" button: have the agent call about this invoice immediately. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const { id } = await params;
  const db = getDb();
  const invoice = db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.businessId, business.id))).get();
  if (!invoice) throw new HttpError(404, "Invoice not found");
  if (!telephonyEnabled() || !agentEnabled()) throw new HttpError(503, "Phone calling is not configured on this server yet");
  try {
    const call = await startPhoneCall({ db, business, telephony: defaultTelephony(), invoice });
    return json({ call: publicCall(call) }, 201);
  } catch (err) {
    if (err instanceof CallNotAllowed) throw new HttpError(409, err.message);
    throw err;
  }
});
