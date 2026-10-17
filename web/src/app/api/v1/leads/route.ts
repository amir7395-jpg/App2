import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { LEAD_STATUSES, leads } from "@/lib/db/schema";
import { body, json, requireSubscriber, route } from "@/lib/http";
import { optionalText, phone } from "@/lib/validation";

const NewLead = z.object({
  name: z.string().trim().min(1),
  phone,
  email: optionalText,
  source: optionalText,
  notes: z.string().default(""),
  consent: z.boolean(),
});

export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const status = new URL(req.url).searchParams.get("status");
  const where = LEAD_STATUSES.includes(status as never)
    ? and(eq(leads.businessId, business.id), eq(leads.status, status as (typeof LEAD_STATUSES)[number]))
    : eq(leads.businessId, business.id);
  return json({ leads: getDb().select().from(leads).where(where).orderBy(desc(leads.createdAt)).all() });
});

export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const input = await body(req, NewLead);
  const lead = getDb().insert(leads).values({ ...input, businessId: business.id }).returning().get();
  return json({ lead }, 201);
});
