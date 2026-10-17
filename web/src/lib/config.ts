/** Central place for environment-driven settings, so feature flags are easy to audit. */
export const config = {
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME ?? "LeadLine",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  agentModel: process.env.AGENT_MODEL ?? "claude-opus-5-5",

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePriceId: process.env.STRIPE_PRICE_ID ?? "",
  /** Local development only: lets "Subscribe" activate an account without Stripe. */
  billingDevBypass: process.env.BILLING_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production",

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  twilioVoice: process.env.TWILIO_VOICE ?? "Polly.Joanna-Neural",

  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID ?? "",
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "",
  /** "sandbox" while developing against an Intuit sandbox company, "production" for real customers. */
  quickbooksEnvironment: (process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox") as
    | "sandbox"
    | "production",
  /** 32-byte key (hex or base64) used to encrypt stored QuickBooks tokens. */
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
};

export const PLAN = {
  name: "Business",
  priceCents: 5000,
  interval: "month" as const,
};

export function sessionSecretBytes(): Uint8Array {
  const secret = config.sessionSecret || (process.env.NODE_ENV === "production" ? "" : "dev-only-insecure-secret");
  if (!secret) throw new Error("SESSION_SECRET must be set in production");
  return new TextEncoder().encode(secret);
}

export const telephonyEnabled = () =>
  Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber);
export const agentEnabled = () => Boolean(config.anthropicApiKey);
export const quickbooksEnabled = () => Boolean(config.quickbooksClientId && config.quickbooksClientSecret);
