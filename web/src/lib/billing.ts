import Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { DB } from "./db";
import { businesses, type Business, type User } from "./db/schema";
import { config } from "./config";

let stripe: Stripe | null = null;
export const getStripe = () => {
  if (!config.stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  return (stripe ??= new Stripe(config.stripeSecretKey));
};

export const billingConfigured = () => Boolean(config.stripeSecretKey && config.stripePriceId);

/** Stripe Checkout session for the $50/month plan. Returns the URL to redirect the browser to. */
export async function createCheckoutUrl(db: DB, business: Business, user: User): Promise<string> {
  const s = getStripe();
  let customerId = business.stripeCustomerId;
  if (!customerId) {
    const customer = await s.customers.create({ email: user.email, name: business.name, metadata: { businessId: business.id } });
    customerId = customer.id;
    db.update(businesses).set({ stripeCustomerId: customerId }).where(eq(businesses.id, business.id)).run();
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: business.id,
    line_items: [{ price: config.stripePriceId, quantity: 1 }],
    subscription_data: { metadata: { businessId: business.id } },
    allow_promotion_codes: true,
    success_url: `${config.publicBaseUrl}/dashboard?welcome=1`,
    cancel_url: `${config.publicBaseUrl}/pricing?canceled=1`,
  });
  return session.url!;
}

export async function createPortalUrl(business: Business): Promise<string> {
  if (!business.stripeCustomerId) throw new Error("No Stripe customer for this account");
  const portal = await getStripe().billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: `${config.publicBaseUrl}/dashboard/settings`,
  });
  return portal.url;
}

function applySubscription(db: DB, sub: Stripe.Subscription) {
  const businessId = sub.metadata.businessId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const periodEnd = sub.items.data[0]?.current_period_end;
  const where = businessId ? eq(businesses.id, businessId) : eq(businesses.stripeCustomerId, customerId);
  db.update(businesses)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    })
    .where(where)
    .run();
}

/** Keep our copy of the subscription status in sync with Stripe. */
export async function handleStripeEvent(db: DB, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        applySubscription(db, await getStripe().subscriptions.retrieve(subId));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      applySubscription(db, event.data.object);
      break;
  }
}
