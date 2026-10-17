import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { body, json, requireSubscriber, route } from "@/lib/http";
import { optionalText, phone } from "@/lib/validation";
import { DAY } from "@/lib/time";

const NewInvoice = z.object({
  invoiceNumber: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: phone,
  customerEmail: optionalText,
  amount: z.number().positive().describe("In dollars"),
  currency: z.string().length(3).default("USD"),
  issuedAt: z.coerce.date(),
  dueAt: z.coerce.date(),
  consent: z.boolean(),
  notes: z.string().default(""),
});

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

export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const { amount, ...input } = await body(req, NewInvoice);
  const invoice = getDb()
    .insert(invoices)
    .values({ ...input, currency: input.currency.toUpperCase(), amountCents: Math.round(amount * 100), businessId: business.id })
    .returning()
    .get();
  return json({ invoice }, 201);
});
