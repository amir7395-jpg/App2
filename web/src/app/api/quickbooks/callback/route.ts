import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessionFromRequest } from "@/lib/auth";
import { businessIdFromState, connect, syncBusiness } from "@/lib/quickbooks";
import { config } from "@/lib/config";

/** Intuit redirects here after the owner approves (or declines) the connection. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (result: string) => NextResponse.redirect(`${config.publicBaseUrl}/dashboard/invoices?qb=${result}`);
  if (url.searchParams.get("error")) return back("declined");

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const businessId = await businessIdFromState(url.searchParams.get("state") ?? "");
  const session = await sessionFromRequest(req);
  // The signed state must match the signed-in owner, so nobody can attach their QuickBooks to someone else's account.
  if (!code || !realmId || !businessId || session?.business.id !== businessId) return back("error");

  const db = getDb();
  try {
    await connect(db, { businessId, code, realmId });
  } catch (err) {
    console.error("QuickBooks connect failed", err);
    return back("error");
  }
  try {
    await syncBusiness(db, session.business);
  } catch (err) {
    console.error("Initial QuickBooks sync failed", err); // shown on the invoices page via lastSyncError
  }
  return back("connected");
}
