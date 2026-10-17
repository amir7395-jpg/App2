import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { HttpError, json, requireSubscriber, route } from "@/lib/http";
import { CallNotAllowed, startPhoneCall } from "@/lib/calls";
import { defaultTelephony } from "@/lib/telephony";
import { agentEnabled, telephonyEnabled } from "@/lib/config";
import { publicCall } from "@/lib/serialize";

/** "Call now" button: have the agent phone this lead immediately. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(leads).where(and(eq(leads.id, id), eq(leads.businessId, business.id))).get();
  if (!lead) throw new HttpError(404, "Lead not found");
  if (!telephonyEnabled() || !agentEnabled()) throw new HttpError(503, "Phone calling is not configured on this server yet");
  try {
    const call = await startPhoneCall({ db, business, telephony: defaultTelephony(), lead });
    return json({ call: publicCall(call) }, 201);
  } catch (err) {
    if (err instanceof CallNotAllowed) throw new HttpError(409, err.message);
    throw err;
  }
});
