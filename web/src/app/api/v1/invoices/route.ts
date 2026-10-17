import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { json, requireSubscriber, route } from "@/lib/http";
import { DAY } from "@/lib/time";

/** Invoices come from QuickBooks (see /api/v1/quickbooks); this lists what has been imported. */
export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const now = Date.now();
  const rows = getDb().select().from(invoices).where(eq(invoices.businessId, business.id)).orderBy(desc(invoices.dueAt)).all();
  return json({
    invoices: rows.map((i) => {
      const daysOverdue = Math.max(0, Math.floor((now - i.dueAt.getTime()) / DAY));
      return {
        ...i,
        daysOverdue,
        // Matches the scheduler: reminders start once the invoice is past the grace period.
        inCollections: i.status === "open" && daysOverdue >= business.invoiceGraceDays,
      };
    }),
  });
});
