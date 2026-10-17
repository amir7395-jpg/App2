"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Modal, StatusBadge, useAction, useApi } from "@/components/ui";
import { api, date, money } from "@/lib/client";
import type { InvoiceDTO } from "@/lib/types";

export default function Invoices() {
  const { data, error, reload } = useApi<{ invoices: InvoiceDTO[] }>("/api/v1/invoices");
  const [adding, setAdding] = useState(false);
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

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="muted" style={{ margin: 0 }}>Open invoices past the grace period (30 days by default) get a reminder call, repeated on your schedule.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add invoice</button>
      </div>
      <ErrorNote error={error || action.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Amount</th><th>Due</th><th>Status</th><th>Reminders</th><th></th></tr></thead>
          <tbody>
            {data?.invoices.map((inv) => (
              <tr key={inv.id}>
                <td><strong>{inv.invoiceNumber}</strong></td>
                <td>{inv.customerName}<div className="muted small">{inv.customerPhone}</div>{!inv.consent && <div className="small" style={{ color: "var(--warning)" }}>No call consent</div>}</td>
                <td>{money(inv.amountCents, inv.currency)}</td>
                <td>{date(inv.dueAt)}{inv.daysOverdue > 0 && inv.status !== "paid" && <div className="small" style={{ color: inv.inCollections ? "var(--danger)" : "var(--warning)" }}>{inv.daysOverdue} days overdue</div>}</td>
                <td><StatusBadge status={inv.status} />{inv.promisedPayDate && inv.status === "promised" && <div className="muted small">by {date(inv.promisedPayDate)}</div>}</td>
                <td>{inv.collectionAttempts}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    {inv.status !== "paid" && <button className="btn btn-sm" onClick={() => patch(inv, { status: "paid" })}>Mark paid</button>}
                    {inv.status !== "paid" && <button className="btn btn-sm" onClick={() => router.push(`/dashboard/practice?invoiceId=${inv.id}`)}>Practice</button>}
                    {inv.status !== "paid" && <button className="btn btn-sm" disabled={!inv.consent || action.busy} onClick={() => remind(inv)}>Remind now</button>}
                    <button className="btn btn-sm" onClick={() => setNotes(inv)}>Notes</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.invoices.length === 0 && <tr><td colSpan={7} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {adding && <AddInvoice onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {notes && (
        <Modal title={`${notes.invoiceNumber} notes`} onClose={() => setNotes(null)}>
          <pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{notes.notes || "No notes yet."}</pre>
          <div className="row">
            {(["open", "disputed", "written_off"] as const).filter((s) => s !== notes.status).map((s) => (
              <button key={s} className="btn btn-sm" onClick={async () => { await patch(notes, { status: s }); setNotes(null); }}>Set {s.replace("_", " ")}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddInvoice({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await run(() =>
      api("/api/v1/invoices", {
        body: {
          invoiceNumber: f.get("invoiceNumber"),
          customerName: f.get("customerName"),
          customerPhone: f.get("customerPhone"),
          customerEmail: f.get("customerEmail"),
          amount: Number(f.get("amount")),
          issuedAt: `${f.get("issuedAt")}T12:00:00`,
          dueAt: `${f.get("dueAt")}T12:00:00`,
          consent: f.get("consent") === "on",
          notes: f.get("notes"),
        },
      }),
    );
    if (ok) onSaved();
  }
  return (
    <Modal title="Add invoice" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Invoice number<input name="invoiceNumber" required /></label>
        <label>Customer name<input name="customerName" required /></label>
        <label>Customer phone<input name="customerPhone" type="tel" required /></label>
        <label>Customer email<input name="customerEmail" type="email" /></label>
        <label>Amount due ($)<input name="amount" type="number" step="0.01" min="0.01" required /></label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label style={{ flex: 1 }}>Issued<input name="issuedAt" type="date" defaultValue={today} required /></label>
          <label style={{ flex: 1 }}>Due<input name="dueAt" type="date" defaultValue={today} required /></label>
        </div>
        <label>Notes<textarea name="notes" /></label>
        <label className="check"><input type="checkbox" name="consent" /> <span>This customer agreed to receive automated / AI phone calls from my business.</span></label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>Save invoice</button>
      </form>
    </Modal>
  );
}
