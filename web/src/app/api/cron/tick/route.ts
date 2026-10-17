import { getDb } from "@/lib/db";
import { runScheduler } from "@/lib/scheduler";
import { defaultTelephony } from "@/lib/telephony";
import { agentEnabled, config, telephonyEnabled } from "@/lib/config";

/**
 * Run every ~15 minutes by a scheduler (Vercel Cron, GitHub Actions, crontab + curl…).
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
async function handler(req: Request) {
  if (!config.cronSecret || req.headers.get("authorization") !== `Bearer ${config.cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!telephonyEnabled() || !agentEnabled()) {
    return Response.json({ skipped: "Telephony or AI agent not configured" });
  }
  return Response.json(await runScheduler({ db: getDb(), telephony: defaultTelephony() }));
}

export const GET = handler;
export const POST = handler;
