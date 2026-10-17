import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connect, syncBusiness, syncDueConnections, setCustomersConsented, businessIdFromState, authorizeUrl } from "../quickbooks";
import { invoices, quickbooksConnections } from "../db/schema";
import { decrypt } from "../crypto";
import { dueInvoices } from "../scheduler";
import { addInvoice, MONDAY_2PM, setup } from "./helpers";
import type { QboCustomer, QboInvoice } from "../quickbooks";

/** A stand-in for Intuit's token endpoint and accounting API. */
function fakeIntuit(state: { invoices: QboInvoice[]; customers: QboCustomer[]; rejectBalanceFilter?: boolean }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let tokenN = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer")) {
      tokenN++;
      return json({ access_token: `access-${tokenN}`, refresh_token: `refresh-${tokenN}`, expires_in: 3600, x_refresh_token_expires_in: 8_726_400 });
    }
    const q = new URL(url).searchParams.get("query") ?? "";
    if (q.includes("from Invoice")) {
      if (state.rejectBalanceFilter && q.includes("Balance")) return json({ Fault: { Error: [{ Detail: "bad field" }] } }, 400);
      return json({ QueryResponse: { Invoice: state.invoices } });
    }
    if (q.includes("from Customer")) {
      const ids = [...q.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      return json({ QueryResponse: { Customer: state.customers.filter((c) => ids.includes(c.Id)) } });
    }
    if (q.includes("from CompanyInfo")) return json({ QueryResponse: { CompanyInfo: [{ CompanyName: "Acme Plumbing LLC" }] } });
    return json({}, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const inv = (Id: string, DueDate: string, Balance: number, customer = "1"): QboInvoice => ({
  Id, DocNumber: `10${Id}`, TxnDate: "2026-07-01", DueDate, TotalAmt: 500, Balance, CustomerRef: { value: customer, name: "Bob's Diner" },
});
const CUSTOMERS: QboCustomer[] = [
  { Id: "1", DisplayName: "Bob's Diner", PrimaryPhone: { FreeFormNumber: "(555) 777-8888" } },
  { Id: "2", DisplayName: "No Phone Inc" },
];

async function connected(customersConsented = true) {
  const ctx = setup();
  const intuit = fakeIntuit({ invoices: [], customers: CUSTOMERS });
  await connect(ctx.db, { businessId: ctx.business.id, code: "auth-code", realmId: "9130", customersConsented, fetchImpl: intuit.fetchImpl, now: MONDAY_2PM });
  return { ...ctx, intuit };
}

describe("QuickBooks OAuth", () => {
  it("signs the state so the callback knows which business connected", async () => {
    const { business } = setup();
    const url = new URL(await authorizeUrl(business.id));
    expect(url.origin + url.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(url.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(await businessIdFromState(url.searchParams.get("state")!)).toBe(business.id);
    expect(await businessIdFromState("forged")).toBeNull();
  });

  it("exchanges the code with Basic auth and stores tokens encrypted", async () => {
    const { db, business, intuit } = await connected();
    const req = intuit.calls[0];
    expect((req.init!.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(req.init!.body)).toContain("grant_type=authorization_code");
    const conn = db.select().from(quickbooksConnections).where(eq(quickbooksConnections.businessId, business.id)).get()!;
    expect(conn.accessToken).not.toContain("access-1");
    expect(decrypt(conn.accessToken)).toBe("access-1");
    expect(conn.realmId).toBe("9130");
  });
});

describe("QuickBooks sync", () => {
  it("imports only unpaid invoices more than 30 days past due, with the customer's phone", async () => {
    const { db, business } = await connected();
    const intuit = fakeIntuit({
      customers: CUSTOMERS,
      invoices: [
        inv("1", "2026-09-01", 250.5), // 48 days overdue -> import
        inv("2", "2026-10-10", 100), // 9 days overdue -> not yet
        inv("3", "2026-08-15", 75, "2"), // overdue but customer has no phone
      ],
    });
    const res = await syncBusiness(db, business, { fetchImpl: intuit.fetchImpl, now: MONDAY_2PM });
    expect(res).toEqual({ imported: 2, updated: 0, closed: 0, missingPhone: 1 });

    const rows = db.select().from(invoices).all();
    const bob = rows.find((r) => r.externalId === "1")!;
    expect(bob).toMatchObject({
      source: "quickbooks", invoiceNumber: "101", customerName: "Bob's Diner", customerPhone: "+15557778888", amountCents: 25050, consent: true, status: "open",
    });
    expect(rows.find((r) => r.externalId === "3")!.customerPhone).toBeNull();
    // Only the invoice with a phone is queued for a reminder call.
    expect(dueInvoices(db, business, MONDAY_2PM).map((i) => i.externalId)).toEqual(["1"]);

    const query = new URL(intuit.calls.find((c) => c.url.includes("from+Invoice") || c.url.includes("Invoice"))!.url);
    expect(query.pathname).toBe("/v3/company/9130/query");
    expect(query.searchParams.get("query")).toBe("select * from Invoice where Balance > '0' startposition 1 maxresults 1000");
    expect(query.searchParams.get("minorversion")).toBe("75");
  });

  it("updates balances on later syncs and closes invoices paid in QuickBooks", async () => {
    const { db, business } = await connected();
    const state = { customers: CUSTOMERS, invoices: [inv("1", "2026-09-01", 250), inv("4", "2026-08-01", 300)] };
    await syncBusiness(db, business, { fetchImpl: fakeIntuit(state).fetchImpl, now: MONDAY_2PM });
    state.invoices = [inv("1", "2026-09-01", 100)]; // partial payment on #1, #4 paid in full
    const res = await syncBusiness(db, business, { fetchImpl: fakeIntuit(state).fetchImpl, now: MONDAY_2PM });
    expect(res).toMatchObject({ imported: 0, updated: 1, closed: 1 });
    const byId = Object.fromEntries(db.select().from(invoices).all().map((r) => [r.externalId, r]));
    expect(byId["1"].amountCents).toBe(10000);
    expect(byId["4"].status).toBe("paid");
  });

  it("leaves manual invoices alone and falls back if the Balance filter is rejected", async () => {
    const { db, business } = await connected();
    addInvoice(db, business.id);
    const intuit = fakeIntuit({ customers: CUSTOMERS, invoices: [inv("1", "2026-09-01", 50), inv("5", "2026-08-01", 0)], rejectBalanceFilter: true });
    const res = await syncBusiness(db, business, { fetchImpl: intuit.fetchImpl, now: MONDAY_2PM });
    expect(res.imported).toBe(1); // the zero-balance invoice is filtered out locally
    expect(db.select().from(invoices).where(eq(invoices.source, "manual")).all()).toHaveLength(1);
  });

  it("refreshes an expired access token and saves the rotated refresh token", async () => {
    const { db, business } = await connected();
    const later = new Date(MONDAY_2PM.getTime() + 2 * 3_600_000);
    const intuit = fakeIntuit({ customers: CUSTOMERS, invoices: [] });
    await syncBusiness(db, business, { fetchImpl: intuit.fetchImpl, now: later });
    expect(String(intuit.calls[0].init!.body)).toContain("grant_type=refresh_token");
    const conn = db.select().from(quickbooksConnections).get()!;
    expect(decrypt(conn.refreshToken)).toBe("refresh-1");
    const apiCall = intuit.calls.find((c) => c.url.includes("/v3/company/"))!;
    expect((apiCall.init!.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });

  it("runs hourly and records errors on the connection", async () => {
    const { db } = await connected();
    const ok = fakeIntuit({ customers: CUSTOMERS, invoices: [] });
    expect((await syncDueConnections(db, { fetchImpl: ok.fetchImpl, now: MONDAY_2PM })).synced).toBe(1);
    // 30 minutes later: not due yet.
    expect((await syncDueConnections(db, { fetchImpl: ok.fetchImpl, now: new Date(MONDAY_2PM.getTime() + 30 * 60_000) })).synced).toBe(0);
    const broken = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const report = await syncDueConnections(db, { fetchImpl: broken, now: new Date(MONDAY_2PM.getTime() + 61 * 60_000) });
    expect(report.errors).toHaveLength(1);
    expect(db.select().from(quickbooksConnections).get()!.lastSyncError).toMatch(/QuickBooks .* 500/);
  });

  it("does not call imported customers unless the owner confirmed consent", async () => {
    const { db, business } = await connected(false);
    await syncBusiness(db, business, { fetchImpl: fakeIntuit({ customers: CUSTOMERS, invoices: [inv("1", "2026-09-01", 50)] }).fetchImpl, now: MONDAY_2PM });
    expect(dueInvoices(db, business, MONDAY_2PM)).toHaveLength(0);
    setCustomersConsented(db, business.id, true);
    expect(dueInvoices(db, business, MONDAY_2PM)).toHaveLength(1);
  });
});
