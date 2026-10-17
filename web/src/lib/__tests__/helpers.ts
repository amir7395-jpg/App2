import { createDb, type DB } from "../db";
import { businesses, invoices, leads, type BusinessHours } from "../db/schema";
import type { Telephony } from "../telephony";

export const WEEKDAY_HOURS: BusinessHours = {
  "0": null,
  "1": { open: "09:00", close: "17:00" },
  "2": { open: "09:00", close: "17:00" },
  "3": { open: "09:00", close: "17:00" },
  "4": { open: "09:00", close: "17:00" },
  "5": { open: "09:00", close: "17:00" },
  "6": null,
};

export function setup() {
  const db: DB = createDb(":memory:");
  const business = db
    .insert(businesses)
    .values({
      name: "Acme Plumbing",
      timezone: "America/New_York",
      businessHours: WEEKDAY_HOURS,
      subscriptionStatus: "active",
      ownerPhone: "+15550000000",
      paymentLink: "https://pay.example.com/acme",
    })
    .returning()
    .get();
  return { db, business };
}

export function addLead(db: DB, businessId: string, extra: Partial<typeof leads.$inferInsert> = {}) {
  return db
    .insert(leads)
    .values({ businessId, name: "Jane Doe", phone: "+15551234567", consent: true, ...extra })
    .returning()
    .get();
}

export function addInvoice(db: DB, businessId: string, extra: Partial<typeof invoices.$inferInsert> = {}) {
  return db
    .insert(invoices)
    .values({
      businessId,
      invoiceNumber: "INV-1001",
      customerName: "Bob Smith",
      customerPhone: "+15557654321",
      amountCents: 45000,
      issuedAt: new Date("2026-08-01T12:00:00Z"),
      dueAt: new Date("2026-08-15T12:00:00Z"),
      consent: true,
      ...extra,
    })
    .returning()
    .get();
}

export function fakeTelephony() {
  const placed: { to: string; callId: string }[] = [];
  const texts: { to: string; body: string }[] = [];
  const telephony: Telephony = {
    async placeCall({ to, callId }) {
      placed.push({ to, callId });
      return { sid: `CA${placed.length}` };
    },
    async sendSms({ to, body }) {
      texts.push({ to, body });
    },
  };
  return { telephony, placed, texts };
}

// Monday 2026-10-19 14:00 New York (EDT, UTC-4)
export const MONDAY_2PM = new Date("2026-10-19T18:00:00Z");
