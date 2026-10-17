import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls, INVOICE_STATUSES, invoices } from "@/lib/db/schema";
import { body, HttpError, json, requireSubscriber, route } from "@/lib/http";
import { publicCall } from "@/lib/serialize";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  consent: z.boolean().optional(),
  notes: z.string().optional(),
  dueAt: z.coerce.date().optional(),
});

function find(businessId: string, id: string) {
  const inv = getDb().select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.businessId, businessId))).get();
  if (!inv) throw new HttpError(404, "Invoice not found");
  return inv;
}

export const GET = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const invoice = find(business.id, (await params).id);
  const history = getDb().select().from(calls).where(eq(calls.invoiceId, invoice.id)).orderBy(desc(calls.createdAt)).all();
  return json({ invoice, calls: history.map(publicCall) });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const invoice = find(business.id, (await params).id);
  const patch = await body(req, Patch);
  const updated = getDb()
    .update(invoices)
    .set({ ...patch, ...(patch.status === "paid" && invoice.status !== "paid" ? { paidAt: new Date() } : {}) })
    .where(eq(invoices.id, invoice.id))
    .returning()
    .get();
  return json({ invoice: updated });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { business } = await requireSubscriber(req);
  const invoice = find(business.id, (await params).id);
  getDb().delete(invoices).where(eq(invoices.id, invoice.id)).run();
  return json({ ok: true });
});
