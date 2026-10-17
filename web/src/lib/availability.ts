import { and, eq, gt, lt, ne } from "drizzle-orm";
import type { DB } from "./db";
import { appointments, type Business } from "./db/schema";
import { DAY, parseHHMM, wallClock, zonedTimeToUtc } from "./time";

export interface Slot {
  start: Date;
  end: Date;
}

/** Opening window for a calendar day (in the business timezone), or null if closed. */
export function openingWindow(business: Business, y: number, m: number, d: number): Slot | null {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const hours = business.businessHours[String(weekday)];
  if (!hours) return null;
  const open = parseHHMM(hours.open);
  const close = parseHHMM(hours.close);
  const start = zonedTimeToUtc(y, m, d, open.hour, open.minute, business.timezone);
  const end = zonedTimeToUtc(y, m, d, close.hour, close.minute, business.timezone);
  return end > start ? { start, end } : null;
}

export function isWithinBusinessHours(business: Business, start: Date, end: Date): boolean {
  const w = wallClock(start, business.timezone);
  const window = openingWindow(business, w.year, w.month, w.day);
  return Boolean(window && start >= window.start && end <= window.end);
}

export function overlapsExisting(db: DB, businessId: string, start: Date, end: Date): boolean {
  const clash = db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        ne(appointments.status, "cancelled"),
        lt(appointments.startsAt, end),
        gt(appointments.endsAt, start),
      ),
    )
    .get();
  return Boolean(clash);
}

/**
 * Free appointment slots on the days starting at `fromDate`, honouring business hours,
 * existing bookings and a minimum lead time so the agent never offers "in 5 minutes".
 */
export function findOpenSlots(
  db: DB,
  business: Business,
  opts: { from: Date; days?: number; limit?: number; minLeadMinutes?: number; now?: Date },
): Slot[] {
  const days = opts.days ?? 7;
  const limit = opts.limit ?? 6;
  const now = opts.now ?? new Date();
  const earliest = new Date(now.getTime() + (opts.minLeadMinutes ?? 120) * 60_000);
  const step = business.appointmentMinutes * 60_000;

  const existing = db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, business.id),
        ne(appointments.status, "cancelled"),
        gt(appointments.endsAt, opts.from),
        lt(appointments.startsAt, new Date(opts.from.getTime() + (days + 1) * DAY)),
      ),
    )
    .all();

  const slots: Slot[] = [];
  for (let i = 0; i < days && slots.length < limit; i++) {
    const w = wallClock(new Date(opts.from.getTime() + i * DAY), business.timezone);
    const window = openingWindow(business, w.year, w.month, w.day);
    if (!window) continue;
    for (let t = window.start.getTime(); t + step <= window.end.getTime(); t += step) {
      const start = new Date(t);
      const end = new Date(t + step);
      if (start < earliest || start < opts.from) continue;
      if (existing.some((a) => a.startsAt < end && a.endsAt > start)) continue;
      slots.push({ start, end });
      if (slots.length >= limit) break;
    }
  }
  return slots;
}
