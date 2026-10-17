import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appointments, calls, LEAD_STATUSES, leads } from "@/lib/db/schema";
import { body, HttpError, json, requireSubscriber, route } from "@/lib/http";
import { optionalText, phone } from "@/lib/validation";
import { publicCall } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

const LeadPatch = z.object({
  name: z.string().trim().min(1).optional(),
  phone: phone.optional(),
  email: optionalText,
  source: optionalText,
  notes: z.string().optional(),
  consent: z.boolean().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  nextFollowUpAt: z.coerce.date().nullable().optional(),
});

function findLead(businessId: string, id: string) {
  const lead = getDb().select().from(leads).where(and(eq(leads.id, id), eq(leads.businessId, businessId))).get();
  if (!lead) throw new HttpError(404, "Lead not found");
  return lead;
}

export const GET = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const lead = findLead(business.id, (await params).id);
  const db = getDb();
  return json({
    lead,
    calls: db.select().from(calls).where(eq(calls.leadId, lead.id)).orderBy(desc(calls.createdAt)).all().map(publicCall),
    appointments: db.select().from(appointments).where(eq(appointments.leadId, lead.id)).all(),
  });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const lead = findLead(business.id, (await params).id);
  const patch = await body(req, LeadPatch);
  const updated = getDb().update(leads).set(patch).where(eq(leads.id, lead.id)).returning().get();
  return json({ lead: updated });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const lead = findLead(business.id, (await params).id);
  getDb().delete(leads).where(eq(leads.id, lead.id)).run();
  return json({ ok: true });
});
