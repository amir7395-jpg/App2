import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { callMessages, calls } from "@/lib/db/schema";
import { HttpError, json, requireSubscriber, route } from "@/lib/http";
import { publicCall } from "@/lib/serialize";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const { id } = await params;
  const db = getDb();
  const call = db.select().from(calls).where(and(eq(calls.id, id), eq(calls.businessId, business.id))).get();
  if (!call) throw new HttpError(404, "Call not found");
  const transcript = db.select().from(callMessages).where(eq(callMessages.callId, id)).orderBy(asc(callMessages.createdAt), sql`rowid`).all();
  return json({ call: publicCall(call), transcript });
});
