"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorNote, useAction, useApi } from "./ui";
import { api, dateTime } from "@/lib/client";
import type { QuickBooksStatus } from "@/lib/types";

const RESULT_MESSAGES: Record<string, { tone: string; text: string }> = {
  connected: { tone: "alert-ok", text: "QuickBooks connected. Your overdue invoices are being imported." },
  declined: { tone: "alert-warn", text: "QuickBooks connection was cancelled." },
  error: { tone: "alert-error", text: "We couldn't connect to QuickBooks. Please try again." },
  not_configured: { tone: "alert-warn", text: "QuickBooks isn't set up on this server yet." },
};

function ResultBanner() {
  const msg = RESULT_MESSAGES[useSearchParams().get("qb") ?? ""];
  return msg ? <p className={`alert ${msg.tone}`} style={{ margin: 0 }}>{msg.text}</p> : null;
}

/** Connect / status / consent / sync controls for the QuickBooks Online integration. */
export function QuickBooksPanel({ onSynced }: { onSynced: () => void }) {
  const { data, reload } = useApi<{ quickbooks: QuickBooksStatus; graceDays: number }>("/api/v1/quickbooks");
  const action = useAction();
  if (!data) return null;
  const qb = data.quickbooks;

  const sync = () =>
    action.run(async () => {
      await api("/api/v1/quickbooks/sync", { method: "POST" });
      await reload();
      onSynced();
    });
  const setConsent = (customersConsented: boolean) =>
    action.run(async () => {
      await api("/api/v1/quickbooks", { method: "PATCH", body: { customersConsented } });
      await reload();
      onSynced();
    });
  const disconnect = async () => {
    if (!confirm("Disconnect QuickBooks? Imported invoices stop updating and the agent stops calling about them.")) return;
    await action.run(async () => {
      await api("/api/v1/quickbooks", { method: "DELETE" });
      await reload();
    });
  };

  return (
    <div className="card stack">
      <Suspense><ResultBanner /></Suspense>
      <div className="spread">
        <div>
          <h3 style={{ margin: 0 }}>QuickBooks Online</h3>
          <p className="muted small" style={{ margin: 0 }}>
            We check QuickBooks every hour for unpaid invoices more than {data.graceDays} days past due and add them here automatically.
            Payments you record in QuickBooks are picked up on the next check, and the agent stops calling.
          </p>
        </div>
        {qb.connected ? (
          <div className="row">
            <button className="btn" disabled={action.busy} onClick={sync}>{action.busy ? "Syncing…" : "Sync now"}</button>
            <button className="btn btn-danger" disabled={action.busy} onClick={disconnect}>Disconnect</button>
          </div>
        ) : qb.available ? (
          <a className="btn btn-primary" href="/api/quickbooks/connect">Connect QuickBooks</a>
        ) : (
          <span className="badge">Not available yet</span>
        )}
      </div>

      {qb.connected && (
        <>
          <div className="small">
            Connected to <strong>{qb.companyName ?? `company ${qb.realmId}`}</strong>
            {qb.environment === "sandbox" && <span className="badge badge-amber" style={{ marginLeft: 8 }}>sandbox</span>}
            {" · "}Last checked {dateTime(qb.lastSyncAt)}
            {qb.lastSyncImported ? ` · ${qb.lastSyncImported} new invoice${qb.lastSyncImported === 1 ? "" : "s"} imported` : ""}
          </div>
          {qb.needsReconnect && (
            <p className="alert alert-warn" style={{ margin: 0 }}>
              QuickBooks access has expired. <a href="/api/quickbooks/connect">Reconnect QuickBooks</a> to keep invoices up to date.
            </p>
          )}
          {qb.lastSyncError && !qb.needsReconnect && <p className="alert alert-error" style={{ margin: 0 }}>Last check failed: {qb.lastSyncError}</p>}
          <label className="check">
            <input type="checkbox" checked={qb.customersConsented} disabled={action.busy} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              My QuickBooks customers have agreed to receive automated / AI phone calls from my business about their account.
              <span className="muted"> The agent won&apos;t call anyone about an invoice until this is checked.</span>
            </span>
          </label>
        </>
      )}
      <ErrorNote error={action.error} />
    </div>
  );
}
