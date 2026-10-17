import { z } from "zod";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appointments, leads } from "@/lib/db/schema";
import { body, HttpError, json, requireSubscriber, route } from "@/lib/http";
import { overlapsExisting } from "@/lib/availability";

const NewAppointment = z.object({
  title: z.string().trim().min(1),
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  leadId: z.string().optional().nullable(),
  notes: z.string().default(""),
});

export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(Date.now() - 86_400_000);
  const rows = getDb()
    .select({ appointment: appointments, lead: { id: leads.id, name: leads.name, phone: leads.phone } })
    .from(appointments)
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .where(and(eq(appointments.businessId, business.id), gte(appointments.startsAt, from)))
    .orderBy(asc(appointments.startsAt))
    .all();
  return json({ appointments: rows.map((r) => ({ ...r.appointment, lead: r.lead })) });
});

export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const input = await body(req, NewAppointment);
  const db = getDb();
  if (input.leadId && !db.select().from(leads).where(and(eq(leads.id, input.leadId), eq(leads.businessId, business.id))).get()) {
    throw new HttpError(404, "Lead not found");
  }
  const endsAt = new Date(input.startsAt.getTime() + (input.durationMinutes ?? business.appointmentMinutes) * 60_000);
  if (overlapsExisting(db, business.id, input.startsAt, endsAt)) throw new HttpError(409, "That time overlaps another appointment");
  const appointment = db
    .insert(appointments)
    .values({ businessId: business.id, title: input.title, startsAt: input.startsAt, endsAt, leadId: input.leadId ?? null, notes: input.notes, bookedBy: "user" })
    .returning()
    .get();
  return json({ appointment }, 201);
});
