import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businesses, calls, invoices, leads } from "@/lib/db/schema";
import { runAgentTurn } from "@/lib/agent/engine";
import { CALL_CONNECTED, voicemailScript } from "@/lib/agent/prompts";
import { defaultTelephony, isValidTwilioRequest, twiml, voiceWebhookUrl, xml } from "@/lib/telephony";
import { config } from "@/lib/config";

const say = { voice: config.twilioVoice as never };

/**
 * Twilio calls this when the person answers and after each thing they say.
 * We reply with TwiML: speak the agent's line, then listen (<Gather input="speech">).
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!isValidTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId") ?? "";
  const db = getDb();
  const call = db.select().from(calls).where(eq(calls.id, callId)).get();
  const response = twiml();
  if (!call || call.ended) {
    response.hangup();
    return xml(response.toString());
  }

  const business = db.select().from(businesses).where(eq(businesses.id, call.businessId)).get()!;
  const isFirstTurn = call.history.length === 0;

  if (isFirstTurn && params.AnsweredBy?.startsWith("machine")) {
    const name = call.leadId
      ? db.select().from(leads).where(eq(leads.id, call.leadId)).get()?.name
      : db.select().from(invoices).where(eq(invoices.id, call.invoiceId!)).get()?.customerName;
    response.say(say, voicemailScript(business, call.purpose, name?.split(" ")[0] ?? "there"));
    response.hangup();
    db.update(calls).set({ status: "voicemail", ended: true, outcome: "Reached voicemail; left a message" }).where(eq(calls.id, call.id)).run();
    return xml(response.toString());
  }

  if (isFirstTurn) db.update(calls).set({ status: "in_progress", twilioCallSid: params.CallSid ?? call.twilioCallSid }).where(eq(calls.id, call.id)).run();

  const speech = params.SpeechResult?.trim();
  const contactSaid = isFirstTurn ? CALL_CONNECTED : speech || "(silence: the person did not say anything)";
  const turn = await runAgentTurn({ db, callId: call.id, contactSaid, hiddenInput: isFirstTurn || !speech, telephony: defaultTelephony() });

  if (turn.ended) {
    response.say(say, turn.reply);
    response.hangup();
  } else {
    const gather = response.gather({
      input: ["speech"],
      action: voiceWebhookUrl(call.id),
      method: "POST",
      speechTimeout: "auto",
      speechModel: "phone_call",
      actionOnEmptyResult: true,
    });
    gather.say(say, turn.reply);
  }
  return xml(response.toString());
}
