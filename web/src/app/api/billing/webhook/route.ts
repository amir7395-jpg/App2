import { getDb } from "@/lib/db";
import { getStripe, handleStripeEvent } from "@/lib/billing";
import { config } from "@/lib/config";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature || !config.stripeWebhookSecret) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), signature, config.stripeWebhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  await handleStripeEvent(getDb(), event);
  return new Response("ok");
}
