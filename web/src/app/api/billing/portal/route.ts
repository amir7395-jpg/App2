import { HttpError, json, requireSession, route } from "@/lib/http";
import { billingConfigured, createPortalUrl } from "@/lib/billing";

export const POST = route(async (req) => {
  const { business } = await requireSession(req);
  if (!billingConfigured() || !business.stripeCustomerId) throw new HttpError(400, "No billing account to manage");
  return json({ url: await createPortalUrl(business) });
});
