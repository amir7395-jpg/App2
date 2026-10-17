import { and, eq, inArray } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { DB } from "./db";
import { businesses, invoices, quickbooksConnections, type Business, type QuickBooksConnection } from "./db/schema";
import { config, sessionSecretBytes } from "./config";
import { decrypt, encrypt } from "./crypto";
import { normalizePhone } from "./compliance";
import { DAY, HOUR, wallClock, zonedTimeToUtc } from "./time";

// Endpoints as defined in Intuit's official OAuth client (intuit-oauth, OAuthClient.js).
export const INTUIT = {
  authorize: "https://appcenter.intuit.com/connect/oauth2",
  token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revoke: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
  api: { sandbox: "https://sandbox-quickbooks.api.intuit.com", production: "https://quickbooks.api.intuit.com" },
  scope: "com.intuit.quickbooks.accounting",
  minorVersion: 75,
};

export const SYNC_INTERVAL_MS = HOUR;
const PAGE_SIZE = 1000;

export const redirectUri = () => `${config.publicBaseUrl}/api/quickbooks/callback`;
const apiBase = () => process.env.QUICKBOOKS_API_BASE_URL ?? INTUIT.api[config.quickbooksEnvironment];
const tokenUrl = () => process.env.QUICKBOOKS_TOKEN_URL ?? INTUIT.token;

/** Injectable so tests can stand in for Intuit's servers. */
export type Fetch = typeof fetch;

export class QuickBooksError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

// ---------- OAuth ----------

/** `state` is a short-lived signed token naming the business, so the callback can't be forged (CSRF). */
export async function authorizeUrl(businessId: string): Promise<string> {
  const state = await new SignJWT({ purpose: "qbo" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(businessId)
    .setExpirationTime("15m")
    .sign(sessionSecretBytes());
  const params = new URLSearchParams({
    client_id: config.quickbooksClientId,
    response_type: "code",
    scope: INTUIT.scope,
    redirect_uri: redirectUri(),
    state,
  });
  return `${process.env.QUICKBOOKS_AUTHORIZE_URL ?? INTUIT.authorize}?${params}`;
}

export async function businessIdFromState(state: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(state, sessionSecretBytes());
    return payload.purpose === "qbo" ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}

async function tokenRequest(body: Record<string, string>, fetchImpl: Fetch): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.quickbooksClientId}:${config.quickbooksClientSecret}`).toString("base64");
  const res = await fetchImpl(tokenUrl(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new QuickBooksError(`QuickBooks sign-in failed: ${data.error ?? res.status}`, res.status);
  return data as TokenResponse;
}

function tokenFields(t: TokenResponse, now: Date) {
  return {
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(t.refresh_token),
    accessTokenExpiresAt: new Date(now.getTime() + t.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + t.x_refresh_token_expires_in * 1000),
  };
}

/** Finish the OAuth flow: trade the authorization code for tokens and save the connection. */
export async function connect(
  db: DB,
  opts: { businessId: string; code: string; realmId: string; customersConsented?: boolean; fetchImpl?: Fetch; now?: Date },
) {
  const now = opts.now ?? new Date();
  const tokens = await tokenRequest(
    { grant_type: "authorization_code", code: opts.code, redirect_uri: redirectUri() },
    opts.fetchImpl ?? fetch,
  );
  const values = { businessId: opts.businessId, realmId: opts.realmId, ...tokenFields(tokens, now), lastSyncError: null };
  db.insert(quickbooksConnections)
    .values({ ...values, customersConsented: opts.customersConsented ?? false })
    .onConflictDoUpdate({ target: quickbooksConnections.businessId, set: values })
    .run();
}

export async function disconnect(db: DB, businessId: string, fetchImpl: Fetch = fetch) {
  const conn = db.select().from(quickbooksConnections).where(eq(quickbooksConnections.businessId, businessId)).get();
  if (!conn) return;
  try {
    const basic = Buffer.from(`${config.quickbooksClientId}:${config.quickbooksClientSecret}`).toString("base64");
    await fetchImpl(INTUIT.revoke, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token: decrypt(conn.refreshToken) }),
    });
  } catch (err) {
    console.error("QuickBooks revoke failed", err);
  }
  db.delete(quickbooksConnections).where(eq(quickbooksConnections.businessId, businessId)).run();
}

/** Returns a valid access token, refreshing (and saving the rotated refresh token) when needed. */
async function accessToken(db: DB, conn: QuickBooksConnection, fetchImpl: Fetch, now: Date, force = false) {
  if (!force && conn.accessTokenExpiresAt.getTime() - now.getTime() > 5 * 60_000) return decrypt(conn.accessToken);
  if (conn.refreshTokenExpiresAt <= now) throw new QuickBooksError("QuickBooks access expired. Please reconnect QuickBooks.", 401);
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(conn.refreshToken) }, fetchImpl);
  const fields = tokenFields(tokens, now);
  db.update(quickbooksConnections).set(fields).where(eq(quickbooksConnections.businessId, conn.businessId)).run();
  Object.assign(conn, fields);
  return tokens.access_token;
}

// ---------- API ----------

export interface QboInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef: { value: string; name?: string };
  CurrencyRef?: { value: string };
  BillEmail?: { Address?: string };
}

export interface QboCustomer {
  Id: string;
  DisplayName?: string;
  PrimaryPhone?: { FreeFormNumber?: string };
  Mobile?: { FreeFormNumber?: string };
  PrimaryEmailAddr?: { Address?: string };
}

class QboClient {
  constructor(
    private db: DB,
    private conn: QuickBooksConnection,
    private fetchImpl: Fetch,
    private now: Date,
  ) {}

  async query<T>(sql: string, retried = false): Promise<Record<string, T[] | number | undefined>> {
    const token = await accessToken(this.db, this.conn, this.fetchImpl, this.now, retried);
    const url = `${apiBase()}/v3/company/${this.conn.realmId}/query?${new URLSearchParams({
      query: sql,
      minorversion: String(INTUIT.minorVersion),
    })}`;
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 401 && !retried) return this.query<T>(sql, true);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.Fault?.Error?.[0]?.Detail ?? data?.Fault?.Error?.[0]?.Message ?? res.statusText;
      throw new QuickBooksError(`QuickBooks API error ${res.status}: ${detail}`, res.status);
    }
    return data.QueryResponse ?? {};
  }

  /** Runs a paged `select * from <Entity> ...` and returns every row. */
  async all<T>(entity: string, where = ""): Promise<T[]> {
    const rows: T[] = [];
    for (let start = 1; ; start += PAGE_SIZE) {
      const page = await this.query<T>(`select * from ${entity}${where} startposition ${start} maxresults ${PAGE_SIZE}`);
      const items = (page[entity] as T[] | undefined) ?? [];
      rows.push(...items);
      if (items.length < PAGE_SIZE) return rows;
    }
  }

  /** All invoices with money still owed. Falls back to a full scan if the Balance filter is rejected. */
  async unpaidInvoices(): Promise<QboInvoice[]> {
    let rows: QboInvoice[];
    try {
      rows = await this.all<QboInvoice>("Invoice", " where Balance > '0'");
    } catch (err) {
      if (!(err instanceof QuickBooksError) || err.status !== 400) throw err;
      rows = await this.all<QboInvoice>("Invoice");
    }
    return rows.filter((i) => (i.Balance ?? 0) > 0);
  }

  async customers(ids: string[]): Promise<Map<string, QboCustomer>> {
    const map = new Map<string, QboCustomer>();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).map((id) => `'${id.replace(/'/g, "\\'")}'`);
      for (const c of await this.all<QboCustomer>("Customer", ` where Id in (${chunk.join(",")})`)) map.set(c.Id, c);
    }
    return map;
  }

  async companyName(): Promise<string | undefined> {
    const page = await this.query<{ CompanyName?: string }>("select * from CompanyInfo");
    return (page.CompanyInfo as { CompanyName?: string }[] | undefined)?.[0]?.CompanyName;
  }
}

// ---------- Sync ----------

export interface SyncResult {
  imported: number;
  updated: number;
  closed: number;
  missingPhone: number;
}

/** QuickBooks dates are plain calendar days; store them as noon in the business timezone. */
function qbDate(value: string | undefined, tz: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return zonedTimeToUtc(y, m, d, 12, 0, tz);
}

/**
 * Pull unpaid invoices from QuickBooks. Invoices past due by the business's grace period (30 days by
 * default) are imported or updated; imported invoices that are no longer open in QuickBooks are closed
 * so the agent stops calling about them.
 */
export async function syncBusiness(
  db: DB,
  business: Business,
  opts: { fetchImpl?: Fetch; now?: Date } = {},
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const conn = db.select().from(quickbooksConnections).where(eq(quickbooksConnections.businessId, business.id)).get();
  if (!conn) throw new QuickBooksError("QuickBooks is not connected");
  const client = new QboClient(db, conn, opts.fetchImpl ?? fetch, now);

  try {
    const unpaid = await client.unpaidInvoices();
    const today = wallClock(now, business.timezone);
    const cutoff = zonedTimeToUtc(today.year, today.month, today.day, 12, 0, business.timezone).getTime() - business.invoiceGraceDays * DAY;
    const overdue = unpaid.filter((i) => {
      const due = qbDate(i.DueDate ?? i.TxnDate, business.timezone);
      return due && due.getTime() <= cutoff;
    });
    const customers = await client.customers([...new Set(overdue.map((i) => i.CustomerRef.value))]);
    const companyName = conn.companyName ?? (await client.companyName().catch(() => undefined));

    const result: SyncResult = { imported: 0, updated: 0, closed: 0, missingPhone: 0 };
    const existing = new Map(
      db
        .select()
        .from(invoices)
        .where(and(eq(invoices.businessId, business.id), eq(invoices.source, "quickbooks")))
        .all()
        .map((i) => [i.externalId!, i]),
    );

    db.transaction((tx) => {
      for (const qi of overdue) {
        const customer = customers.get(qi.CustomerRef.value);
        const rawPhone = customer?.PrimaryPhone?.FreeFormNumber || customer?.Mobile?.FreeFormNumber || "";
        const phone = normalizePhone(rawPhone);
        if (!phone) result.missingPhone++;
        const fields = {
          invoiceNumber: qi.DocNumber || `QB-${qi.Id}`,
          customerName: customer?.DisplayName || qi.CustomerRef.name || "Customer",
          customerPhone: phone,
          customerEmail: qi.BillEmail?.Address || customer?.PrimaryEmailAddr?.Address || null,
          amountCents: Math.round((qi.Balance ?? 0) * 100),
          currency: qi.CurrencyRef?.value || "USD",
          issuedAt: qbDate(qi.TxnDate, business.timezone) ?? now,
          dueAt: qbDate(qi.DueDate ?? qi.TxnDate, business.timezone)!,
          syncedAt: now,
        };
        const prev = existing.get(qi.Id);
        if (prev) {
          existing.delete(qi.Id);
          // Re-open an invoice we had closed if QuickBooks shows it unpaid again; keep owner/agent statuses otherwise.
          const reopen = prev.status === "paid" ? { status: "open" as const, paidAt: null } : {};
          tx.update(invoices).set({ ...fields, ...reopen }).where(eq(invoices.id, prev.id)).run();
          result.updated++;
        } else {
          tx.insert(invoices)
            .values({ ...fields, businessId: business.id, source: "quickbooks", externalId: qi.Id, consent: conn.customersConsented })
            .run();
          result.imported++;
        }
      }

      // Anything we imported that is no longer unpaid in QuickBooks was paid, voided or deleted there.
      const stillUnpaid = new Set(unpaid.map((i) => i.Id));
      const closedIds = [...existing.values()]
        .filter((i) => i.status !== "paid" && !stillUnpaid.has(i.externalId!))
        .map((i) => i.id);
      if (closedIds.length) {
        tx.update(invoices)
          .set({ status: "paid", paidAt: now, syncedAt: now })
          .where(inArray(invoices.id, closedIds))
          .run();
        result.closed = closedIds.length;
      }

      tx.update(quickbooksConnections)
        .set({ lastSyncAt: now, lastSyncError: null, lastSyncImported: result.imported, companyName: companyName ?? null })
        .where(eq(quickbooksConnections.businessId, business.id))
        .run();
    });
    return result;
  } catch (err) {
    db.update(quickbooksConnections)
      .set({ lastSyncAt: now, lastSyncError: err instanceof Error ? err.message : String(err) })
      .where(eq(quickbooksConnections.businessId, business.id))
      .run();
    throw err;
  }
}

/** Hourly: sync every subscribed business whose QuickBooks data is more than an hour old. */
export async function syncDueConnections(db: DB, opts: { fetchImpl?: Fetch; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const rows = db
    .select({ business: businesses, conn: quickbooksConnections })
    .from(quickbooksConnections)
    .innerJoin(businesses, eq(businesses.id, quickbooksConnections.businessId))
    .where(inArray(businesses.subscriptionStatus, ["active", "trialing"]))
    .all()
    .filter((r) => !r.conn.lastSyncAt || now.getTime() - r.conn.lastSyncAt.getTime() >= SYNC_INTERVAL_MS - 60_000);
  const report = { synced: 0, errors: [] as string[] };
  for (const { business } of rows) {
    try {
      await syncBusiness(db, business, { ...opts, now });
      report.synced++;
    } catch (err) {
      report.errors.push(`${business.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return report;
}

export function connectionStatus(db: DB, businessId: string) {
  const conn = db.select().from(quickbooksConnections).where(eq(quickbooksConnections.businessId, businessId)).get();
  if (!conn) return { connected: false as const };
  return {
    connected: true as const,
    companyName: conn.companyName,
    realmId: conn.realmId,
    customersConsented: conn.customersConsented,
    lastSyncAt: conn.lastSyncAt,
    lastSyncError: conn.lastSyncError,
    lastSyncImported: conn.lastSyncImported,
    needsReconnect: conn.refreshTokenExpiresAt <= new Date(),
  };
}

/** The owner's consent attestation applies to every imported invoice (they can still opt single ones out). */
export function setCustomersConsented(db: DB, businessId: string, consented: boolean) {
  db.update(quickbooksConnections).set({ customersConsented: consented }).where(eq(quickbooksConnections.businessId, businessId)).run();
  db.update(invoices)
    .set({ consent: consented })
    .where(and(eq(invoices.businessId, businessId), eq(invoices.source, "quickbooks")))
    .run();
}
