import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appointments, calls, invoices, leads } from "@/lib/db/schema";
import { json, requireSubscriber, route } from "@/lib/http";
import { DAY } from "@/lib/time";

export const GET = route(async (req) => {
  const { business } = await requireSubscriber(req);
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const count = (q: { n: number } | undefined) => q?.n ?? 0;

  const openLeads = db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.businessId, business.id), inArray(leads.status, ["new", "contacted", "follow_up"])))
    .get();
  const upcoming = db
    .select({ n: sql<number>`count(*)` })
    .from(appointments)
    .where(and(eq(appointments.businessId, business.id), eq(appointments.status, "scheduled"), gte(appointments.startsAt, now)))
    .get();
  const callsThisWeek = db
    .select({ n: sql<number>`count(*)` })
    .from(calls)
    .where(and(eq(calls.businessId, business.id), gte(calls.createdAt, weekAgo)))
    .get();
  const booked = db
    .select({ n: sql<number>`count(*)` })
    .from(appointments)
    .where(and(eq(appointments.businessId, business.id), eq(appointments.bookedBy, "agent"), gte(appointments.createdAt, weekAgo)))
    .get();
  const graceCutoff = new Date(now.getTime() - business.invoiceGraceDays * DAY);
  const overdue = db
    .select({ n: sql<number>`count(*)`, cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.businessId, business.id), inArray(invoices.status, ["open", "promised"]), sql`${invoices.dueAt} <= ${graceCutoff.getTime()}`))
    .get();
  const recovered = db
    .select({ cents: sql<number>`coalesce(sum(${invoices.amountCents}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.businessId, business.id), eq(invoices.status, "paid"), sql`${invoices.collectionAttempts} > 0`))
    .get();

  return json({
    openLeads: count(openLeads),
    upcomingAppointments: count(upcoming),
    callsThisWeek: count(callsThisWeek),
    agentBookingsThisWeek: count(booked),
    overdueInvoices: overdue?.n ?? 0,
    overdueAmountCents: overdue?.cents ?? 0,
    recoveredAmountCents: recovered?.cents ?? 0,
  });
});
