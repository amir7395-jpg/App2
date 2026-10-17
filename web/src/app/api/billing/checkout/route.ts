import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses } from "@/lib/db/schema";
import { HttpError, json, requireSession, route } from "@/lib/http";
import { billingConfigured, createCheckoutUrl } from "@/lib/billing";
import { config } from "@/lib/config";
import { hasActiveSubscription } from "@/lib/auth";

export const POST = route(async (req) => {
  const { user, business } = await requireSession(req);
  if (hasActiveSubscription(business)) return json({ url: "/dashboard" });
  const db = getDb();
  if (billingConfigured()) return json({ url: await createCheckoutUrl(db, business, user) });
  if (config.billingDevBypass) {
    db.update(businesses).set({ subscriptionStatus: "active" }).where(eq(businesses.id, business.id)).run();
    return json({ url: "/dashboard?welcome=1" });
  }
  throw new HttpError(503, "Billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.");
});
