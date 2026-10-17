import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
import { body, json, requireSession, requireSubscriber, route } from "@/lib/http";
import { isValidTimeZone } from "@/lib/time";
import { phone } from "@/lib/validation";
import { agentEnabled, telephonyEnabled } from "@/lib/config";
import { billingConfigured } from "@/lib/billing";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const Settings = z.object({
  name: z.string().trim().min(1).optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").optional(),
  ownerPhone: phone.nullable().optional(),
  callerId: phone.nullable().optional(),
  agentName: z.string().trim().min(1).max(40).optional(),
  agentInstructions: z.string().max(8000).optional(),
  appointmentMinutes: z.number().int().min(10).max(480).optional(),
  businessHours: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.object({ open: hhmm, close: hhmm }).nullable()).optional(),
  leadFollowUpHours: z.number().int().min(1).max(24 * 30).optional(),
  leadMaxAttempts: z.number().int().min(1).max(10).optional(),
  invoiceGraceDays: z.number().int().min(0).max(365).optional(),
  invoiceFollowUpDays: z.number().int().min(1).max(60).optional(),
  invoiceMaxAttempts: z.number().int().min(1).max(12).optional(),
  paymentLink: z.url().nullable().optional().or(z.literal("").transform(() => null)),
  autopilot: z.boolean().optional(),
});

function view(b: typeof businesses.$inferSelect) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { stripeCustomerId, stripeSubscriptionId, ...rest } = b;
  return {
    ...rest,
    integrations: { telephony: telephonyEnabled(), agent: agentEnabled(), billing: billingConfigured() },
    hasBillingAccount: Boolean(stripeCustomerId),
  };
}

export const GET = route(async (req) => json({ settings: view((await requireSession(req)).business) }));

export const PATCH = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const patch = await body(req, Settings);
  const updated = getDb().update(businesses).set(patch).where(eq(businesses.id, business.id)).returning().get();
  return json({ settings: view(updated) });
});
