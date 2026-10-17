"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Modal, StatusBadge, useAction, useApi } from "@/components/ui";
import { QuickBooksPanel } from "@/components/QuickBooksPanel";
import { api, date, dateTime, money } from "@/lib/client";
import type { InvoiceDTO } from "@/lib/types";

export default function Invoices() {
  const { data, error, reload } = useApi<{ invoices: InvoiceDTO[] }>("/api/v1/invoices");
  const [notes, setNotes] = useState<InvoiceDTO | null>(null);
  const action = useAction();
  const router = useRouter();

  const patch = (inv: InvoiceDTO, body: Record<string, unknown>) =>
    action.run(async () => { await api(`/api/v1/invoices/${inv.id}`, { method: "PATCH", body }); await reload(); });
  const remind = async (inv: InvoiceDTO) => {
    if (!confirm(`Have the agent call ${inv.customerName} about ${inv.invoiceNumber} now?`)) return;
    if (await action.run(() => api(`/api/v1/invoices/${inv.id}/call`, { method: "POST" }))) {
      alert("Calling now. The transcript will appear under Calls.");
      reload();
    }
  };
  const callable = (inv: InvoiceDTO) => inv.consent && Boolean(inv.customerPhone);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1 className="page-title">Overdue invoices</h1>
        <p className="muted" style={{ margin: 0 }}>Imported from QuickBooks. The agent makes a polite reminder call, then repeats on the schedule in Settings until it&apos;s paid in QuickBooks.</p>
      </div>
      <QuickBooksPanel onSynced={reload} />
      <ErrorNote error={error || action.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Balance due</th><th>Due</th><th>Status</th><th>Reminder calls</th><th></th></tr></thead>
          <tbody>
            {data?.invoices.map((inv) => (
              <tr key={inv.id}>
                <td><strong>{inv.invoiceNumber}</strong>{inv.syncedAt && <div className="muted small">synced {dateTime(inv.syncedAt)}</div>}</td>
                <td>
                  {inv.customerName}
                  <div className="muted small">{inv.customerPhone ?? "No phone in QuickBooks"}</div>
                  {inv.status === "open" && !inv.consent && <div className="small" style={{ color: "var(--warning)" }}>Calls off</div>}
                </td>
                <td>{money(inv.amountCents, inv.currency)}</td>
                <td>{date(inv.dueAt)}{inv.daysOverdue > 0 && inv.status !== "paid" && <div className="small" style={{ color: "var(--danger)" }}>{inv.daysOverdue} days overdue</div>}</td>
                <td><StatusBadge status={inv.status} />{inv.promisedPayDate && inv.status === "promised" && <div className="muted small">by {date(inv.promisedPayDate)}</div>}</td>
                <td>{inv.collectionAttempts}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    {inv.status !== "paid" && <button className="btn btn-sm" onClick={() => router.push(`/dashboard/practice?invoiceId=${inv.id}`)}>Practice</button>}
                    {inv.status !== "paid" && <button className="btn btn-sm" disabled={!callable(inv) || action.busy} onClick={() => remind(inv)}>Remind now</button>}
                    <button className="btn btn-sm" onClick={() => setNotes(inv)}>Details</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.invoices.length === 0 && <tr><td colSpan={7} className="muted">No overdue invoices yet. Connect QuickBooks above and they&apos;ll appear here automatically.</td></tr>}
          </tbody>
        </table>
      </div>
      {notes && (
        <Modal title={`Invoice ${notes.invoiceNumber}`} onClose={() => setNotes(null)}>
          <div className="stack">
            <pre style={{ whiteSpace: "pre-wrap", font: "inherit", margin: 0 }}>{notes.notes || "No notes yet. Promises, disputes and other call outcomes appear here."}</pre>
            {notes.status !== "paid" && (
              <label className="check">
                <input type="checkbox" checked={notes.consent} onChange={async (e) => { await patch(notes, { consent: e.target.checked }); setNotes({ ...notes, consent: e.target.checked }); }} />
                <span>Agent may call this customer about this invoice</span>
              </label>
            )}
            <div className="row">
              {(["open", "disputed", "written_off"] as const).filter((s) => s !== notes.status && notes.status !== "paid").map((s) => (
                <button key={s} className="btn btn-sm" onClick={async () => { await patch(notes, { status: s }); setNotes(null); }}>Set {s.replace("_", " ")}</button>
              ))}
            </div>
            <p className="muted small" style={{ margin: 0 }}>Record payments in QuickBooks; this list updates within the hour.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
