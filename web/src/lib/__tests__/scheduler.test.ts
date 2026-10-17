import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { runScheduler } from "../scheduler";
import { completeCall, startPhoneCall } from "../calls";
import { businesses, calls, invoices, leads } from "../db/schema";
import { addInvoice, addLead, fakeTelephony, MONDAY_2PM, setup } from "./helpers";
import { DAY, HOUR } from "../time";

describe("scheduler", () => {
  it("calls new consented leads and invoices 30+ days overdue, nothing else", async () => {
    const { db, business } = setup();
    const fresh = addLead(db, business.id, { phone: "+15550000001" });
    addLead(db, business.id, { phone: "+15550000002", consent: false });
    addLead(db, business.id, { phone: "+15550000003", status: "do_not_call" });
    addLead(db, business.id, { phone: "+15550000004", status: "follow_up", attempts: 1, nextFollowUpAt: new Date(MONDAY_2PM.getTime() + HOUR) });
    const overdue = addInvoice(db, business.id, { dueAt: new Date(MONDAY_2PM.getTime() - 31 * DAY) });
    addInvoice(db, business.id, { invoiceNumber: "recent", dueAt: new Date(MONDAY_2PM.getTime() - 10 * DAY) });
    addInvoice(db, business.id, { invoiceNumber: "paid", status: "paid", dueAt: new Date(MONDAY_2PM.getTime() - 60 * DAY) });

    const { telephony, placed } = fakeTelephony();
    const report = await runScheduler({ db, telephony, now: MONDAY_2PM });
    expect(report).toMatchObject({ leadCalls: 1, invoiceCalls: 1, errors: [] });
    expect(placed.map((p) => p.to).sort()).toEqual([fresh.phone, overdue.customerPhone].sort());

    // Running again immediately must not re-dial anyone.
    const again = await runScheduler({ db, telephony, now: new Date(MONDAY_2PM.getTime() + 15 * 60_000) });
    expect(again.leadCalls + again.invoiceCalls).toBe(0);
  });

  it("does nothing outside calling hours or for unpaid accounts", async () => {
    const { db, business } = setup();
    addLead(db, business.id);
    const { telephony, placed } = fakeTelephony();
    await runScheduler({ db, telephony, now: new Date("2026-10-20T02:00:00Z") }); // 10pm NY
    db.update(businesses).set({ subscriptionStatus: "canceled" }).where(eq(businesses.id, business.id)).run();
    await runScheduler({ db, telephony, now: MONDAY_2PM });
    expect(placed).toHaveLength(0);
  });

  it("re-opens broken payment promises", async () => {
    const { db, business } = setup();
    addInvoice(db, business.id, { status: "promised", promisedPayDate: new Date(MONDAY_2PM.getTime() - 3 * DAY), dueAt: new Date(MONDAY_2PM.getTime() - 40 * DAY) });
    const { telephony, placed } = fakeTelephony();
    const report = await runScheduler({ db, telephony, now: MONDAY_2PM });
    expect(report.promisesLapsed).toBe(1);
    expect(placed).toHaveLength(1);
  });
});

describe("call completion", () => {
  it("schedules a follow-up after voicemail, and gives up after max attempts", async () => {
    const { db, business } = setup();
    const lead = addLead(db, business.id, { attempts: 1 });
    const { telephony } = fakeTelephony();
    const call = await startPhoneCall({ db, business, telephony, lead, now: MONDAY_2PM });
    completeCall(db, call.id, { callStatus: "completed", answeredBy: "machine_end_beep" }, MONDAY_2PM);
    let saved = db.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    expect(saved).toMatchObject({ attempts: 2, status: "contacted" });
    expect(saved.nextFollowUpAt!.getTime()).toBe(MONDAY_2PM.getTime() + 48 * HOUR);
    expect(db.select().from(calls).get()!.status).toBe("voicemail");

    const call2 = await startPhoneCall({ db, business, telephony, lead: saved, now: MONDAY_2PM });
    completeCall(db, call2.id, { callStatus: "no-answer" }, MONDAY_2PM);
    saved = db.select().from(leads).where(eq(leads.id, lead.id)).get()!;
    expect(saved).toMatchObject({ attempts: 3, status: "unreachable", nextFollowUpAt: null });
  });

  it("refuses to dial without consent", async () => {
    const { db, business } = setup();
    const lead = addLead(db, business.id, { consent: false });
    await expect(startPhoneCall({ db, business, telephony: fakeTelephony().telephony, lead, now: MONDAY_2PM })).rejects.toThrow(/consent/);
    expect(db.select().from(calls).all()).toHaveLength(0);
    expect(db.select().from(invoices).all()).toHaveLength(0);
  });
});
