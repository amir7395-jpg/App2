import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { APPOINTMENT_STATUSES, appointments } from "@/lib/db/schema";
import { body, HttpError, json, requireSubscriber, route } from "@/lib/http";

const Patch = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  notes: z.string().optional(),
  title: z.string().trim().min(1).optional(),
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const { id } = await params;
  const patch = await body(req, Patch);
  const appointment = getDb()
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)))
    .returning()
    .get();
  if (!appointment) throw new HttpError(404, "Appointment not found");
  return json({ appointment });
});
