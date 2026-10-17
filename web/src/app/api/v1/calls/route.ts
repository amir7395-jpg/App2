import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls, invoices, leads } from "@/lib/db/schema";
import { json, requireSubscriber, route } from "@/lib/http";
import { publicCall } from "@/lib/serialize";

export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const rows = getDb()
    .select({ call: calls, leadName: leads.name, customerName: invoices.customerName, invoiceNumber: invoices.invoiceNumber })
    .from(calls)
    .leftJoin(leads, eq(calls.leadId, leads.id))
    .leftJoin(invoices, eq(calls.invoiceId, invoices.id))
    .where(eq(calls.businessId, business.id))
    .orderBy(desc(calls.createdAt))
    .limit(200)
    .all();
  return json({
    calls: rows.map((r) => ({
      ...publicCall(r.call),
      contactName: r.leadName ?? r.customerName ?? r.call.toPhone,
      invoiceNumber: r.invoiceNumber,
    })),
  });
});
