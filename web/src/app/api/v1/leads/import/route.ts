import { z } from "zod";
import { getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { body, json, requireSubscriber, route } from "@/lib/http";
import { normalizePhone } from "@/lib/compliance";
import { parseCsv } from "@/lib/csv";

const Import = z.object({
  csv: z.string().max(2_000_000),
  /** The account holder confirms every row has consented to automated calls. */
  consent: z.boolean(),
  source: z.string().optional(),
});

/** CSV import with columns: name, phone, email (optional), notes (optional). */
export const POST = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const input = await body(req, Import);
  const rows = parseCsv(input.csv);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [iName, iPhone, iEmail, iNotes] = ["name", "phone", "email", "notes"].map(col);
  if (iName < 0 || iPhone < 0) return json({ error: "CSV needs a header row with at least 'name' and 'phone' columns" }, 400);

  const skipped: { line: number; reason: string }[] = [];
  const values: (typeof leads.$inferInsert)[] = [];
  rows.forEach((r, i) => {
    const name = r[iName]?.trim();
    const p = normalizePhone(r[iPhone] ?? "");
    if (!name || !p) return skipped.push({ line: i + 2, reason: !name ? "missing name" : "invalid phone" });
    values.push({
      businessId: business.id,
      name,
      phone: p,
      email: iEmail >= 0 ? r[iEmail]?.trim() || null : null,
      notes: iNotes >= 0 ? r[iNotes]?.trim() ?? "" : "",
      source: input.source || "CSV import",
      consent: input.consent,
    });
  });
  if (values.length) getDb().insert(leads).values(values).run();
  return json({ imported: values.length, skipped });
});
