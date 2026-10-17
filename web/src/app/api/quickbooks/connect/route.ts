import { NextResponse } from "next/server";
import { hasActiveSubscription, sessionFromRequest } from "@/lib/auth";
import { authorizeUrl } from "@/lib/quickbooks";
import { config, quickbooksEnabled } from "@/lib/config";

/** "Connect QuickBooks" button: send the owner to Intuit to approve read access to their books. */
export async function GET(req: Request) {
  const session = await sessionFromRequest(req);
  if (!session) return NextResponse.redirect(`${config.publicBaseUrl}/login`);
  if (!hasActiveSubscription(session.business)) return NextResponse.redirect(`${config.publicBaseUrl}/pricing?subscribe=1`);
  if (!quickbooksEnabled()) return NextResponse.redirect(`${config.publicBaseUrl}/dashboard/invoices?qb=not_configured`);
  return NextResponse.redirect(await authorizeUrl(session.business.id));
}
