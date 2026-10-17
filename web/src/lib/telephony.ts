import twilio from "twilio";
import { config, telephonyEnabled } from "./config";

/** Everything that talks to the phone network goes through this interface so it can be swapped in tests. */
export interface Telephony {
  placeCall(opts: { to: string; from: string; callId: string }): Promise<{ sid: string }>;
  sendSms(opts: { to: string; from: string; body: string }): Promise<void>;
}

let client: ReturnType<typeof twilio> | null = null;
const getClient = () => (client ??= twilio(config.twilioAccountSid, config.twilioAuthToken));

export const voiceWebhookUrl = (callId: string) =>
  `${config.publicBaseUrl}/api/twilio/voice?callId=${encodeURIComponent(callId)}`;
export const statusWebhookUrl = (callId: string) =>
  `${config.publicBaseUrl}/api/twilio/status?callId=${encodeURIComponent(callId)}`;

export const twilioTelephony: Telephony = {
  async placeCall({ to, from, callId }) {
    const call = await getClient().calls.create({
      to,
      from,
      url: voiceWebhookUrl(callId),
      method: "POST",
      statusCallback: statusWebhookUrl(callId),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
      // Lets us leave a short voicemail instead of talking to an answering machine.
      machineDetection: "Enable",
      timeout: 25,
    });
    return { sid: call.sid };
  },
  async sendSms({ to, from, body }) {
    await getClient().messages.create({ to, from, body });
  },
};

/** No-op stand-in used when Twilio is not configured (and in simulations). */
export const nullTelephony: Telephony = {
  async placeCall() {
    throw new Error("Telephony is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)");
  },
  async sendSms() {},
};

export const defaultTelephony = (): Telephony => (telephonyEnabled() ? twilioTelephony : nullTelephony);

/** Verify a webhook really came from Twilio (X-Twilio-Signature over the public URL + form params). */
export function isValidTwilioRequest(req: Request, params: Record<string, string>): boolean {
  if (!config.twilioAuthToken) return false;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = new URL(req.url);
  const publicUrl = `${config.publicBaseUrl}${url.pathname}${url.search}`;
  return twilio.validateRequest(config.twilioAuthToken, signature, publicUrl, params);
}

export function twiml() {
  return new twilio.twiml.VoiceResponse();
}

export const xml = (body: string) => new Response(body, { headers: { "content-type": "text/xml" } });
