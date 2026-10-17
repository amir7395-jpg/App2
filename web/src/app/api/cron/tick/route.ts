import { getDb } from "@/lib/db";
import { runScheduler } from "@/lib/scheduler";
import { syncDueConnections } from "@/lib/quickbooks";
import { defaultTelephony } from "@/lib/telephony";
import { agentEnabled, config, quickbooksEnabled, telephonyEnabled } from "@/lib/config";

/**
 * Run every ~15 minutes by a scheduler (crontab + curl, GitHub Actions, your host's cron…).
 * Requires `Authorization: Bearer $CRON_SECRET`.
 * 1. Pulls overdue invoices from QuickBooks for accounts not synced in the last hour.
 * 2. Places any calls that are due.
 */
async function handler(req: Request) {
  if (!config.cronSecret || req.headers.get("authorization") !== `Bearer ${config.cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getDb();
  const quickbooks = quickbooksEnabled() ? await syncDueConnections(db) : { skipped: "QuickBooks not configured" };
  const calls =
    telephonyEnabled() && agentEnabled()
      ? await runScheduler({ db, telephony: defaultTelephony() })
      : { skipped: "Telephony or AI agent not configured" };
  return Response.json({ quickbooks, calls });
}

export const GET = handler;
export const POST = handler;
