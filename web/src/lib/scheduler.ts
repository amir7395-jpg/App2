import { and, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { DB } from "./db";
import { businesses, invoices, leads, quickbooksConnections, type Business } from "./db/schema";
import { isWithinCallingWindow } from "./compliance";
import { startPhoneCall } from "./calls";
import type { Telephony } from "./telephony";
import { DAY } from "./time";

export interface SchedulerReport {
  businessesChecked: number;
  leadCalls: number;
  invoiceCalls: number;
  promisesLapsed: number;
  errors: string[];
}

/** Leads the agent should call now: consented, still open, and due (new, or follow-up time reached). */
export function dueLeads(db: DB, business: Business, now: Date) {
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.businessId, business.id),
        eq(leads.consent, true),
        inArray(leads.status, ["new", "contacted", "follow_up"]),
        or(
          and(eq(leads.status, "new"), eq(leads.attempts, 0)),
          lte(leads.nextFollowUpAt, now),
        ),
      ),
    )
    .all()
    .filter((l) => l.attempts < business.leadMaxAttempts);
}

/** Invoices past due by the grace period (30 days by default) and not called recently. */
export function dueInvoices(db: DB, business: Business, now: Date) {
  // Without a live QuickBooks connection we can't tell whether imported invoices were paid, so don't call about them.
  const qbConnected = Boolean(
    db.select({ id: quickbooksConnections.businessId }).from(quickbooksConnections).where(eq(quickbooksConnections.businessId, business.id)).get(),
  );
  const overdueBefore = new Date(now.getTime() - business.invoiceGraceDays * DAY);
  const lastCallBefore = new Date(now.getTime() - business.invoiceFollowUpDays * DAY);
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.businessId, business.id),
        eq(invoices.consent, true),
        eq(invoices.status, "open"),
        isNotNull(invoices.customerPhone),
        qbConnected ? undefined : ne(invoices.source, "quickbooks"),
        lte(invoices.dueAt, overdueBefore),
        or(isNull(invoices.lastCollectionAt), lte(invoices.lastCollectionAt, lastCallBefore)),
      ),
    )
    .all()
    .filter((i) => i.collectionAttempts < business.invoiceMaxAttempts);
}

/**
 * One scheduler tick (run every ~15 minutes by cron). Places at most `maxCallsPerBusiness`
 * calls per business so a big import doesn't dial hundreds of people at once.
 */
export async function runScheduler(opts: {
  db: DB;
  telephony: Telephony;
  now?: Date;
  maxCallsPerBusiness?: number;
}): Promise<SchedulerReport> {
  const { db, telephony } = opts;
  const now = opts.now ?? new Date();
  const max = opts.maxCallsPerBusiness ?? 5;
  const report: SchedulerReport = { businessesChecked: 0, leadCalls: 0, invoiceCalls: 0, promisesLapsed: 0, errors: [] };

  // A broken payment promise puts the invoice back into the reminder queue.
  const lapsed = db
    .update(invoices)
    .set({ status: "open" })
    .where(and(eq(invoices.status, "promised"), lte(invoices.promisedPayDate, new Date(now.getTime() - DAY))))
    .returning({ id: invoices.id })
    .all();
  report.promisesLapsed = lapsed.length;

  const active = db
    .select()
    .from(businesses)
    .where(and(inArray(businesses.subscriptionStatus, ["active", "trialing"]), eq(businesses.autopilot, true)))
    .all();

  for (const business of active) {
    report.businessesChecked++;
    if (!isWithinCallingWindow(business, now)) continue;
    let budget = max;
    for (const lead of dueLeads(db, business, now)) {
      if (budget <= 0) break;
      try {
        await startPhoneCall({ db, business, telephony, lead, now });
        report.leadCalls++;
        budget--;
      } catch (err) {
        report.errors.push(`lead ${lead.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
    for (const invoice of dueInvoices(db, business, now)) {
      if (budget <= 0) break;
      try {
        await startPhoneCall({ db, business, telephony, invoice, now });
        report.invoiceCalls++;
        budget--;
      } catch (err) {
        report.errors.push(`invoice ${invoice.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  return report;
}
