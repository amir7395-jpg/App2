import { getDb } from "@/lib/db";
import { completeCall } from "@/lib/calls";
import { isValidTwilioRequest } from "@/lib/telephony";

/** Twilio status callback: fires once the call is over (answered, voicemail, busy, no answer…). */
export async function POST(req: Request) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (!isValidTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });
  const callId = new URL(req.url).searchParams.get("callId");
  if (callId) {
    completeCall(getDb(), callId, {
      callStatus: params.CallStatus ?? "",
      answeredBy: params.AnsweredBy,
      durationSeconds: Number(params.CallDuration ?? 0),
    });
  }
  return new Response(null, { status: 204 });
}
