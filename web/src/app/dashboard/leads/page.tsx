"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Modal, StatusBadge, useAction, useApi } from "@/components/ui";
import { api, dateTime } from "@/lib/client";
import type { LeadDTO } from "@/lib/types";

const FILTERS = ["all", "new", "contacted", "follow_up", "appointment_set", "not_interested", "unreachable", "do_not_call"];

export default function Leads() {
  const [filter, setFilter] = useState("all");
  const { data, error, reload } = useApi<{ leads: LeadDTO[] }>(`/api/v1/leads${filter === "all" ? "" : `?status=${filter}`}`);
  const [modal, setModal] = useState<"add" | "import" | null>(null);
  const action = useAction();
  const router = useRouter();

  async function callNow(lead: LeadDTO) {
    if (!confirm(`Have the agent call ${lead.name} now?`)) return;
    if (await action.run(() => api(`/api/v1/leads/${lead.id}/call`, { method: "POST" }))) {
      alert("Calling now. The transcript will appear under Calls.");
      reload();
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="muted" style={{ margin: 0 }}>New leads are called automatically during calling hours, then followed up until they book or say no.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setModal("import")}>Import CSV</button>
          <button className="btn btn-primary" onClick={() => setModal("add")}>Add lead</button>
        </div>
      </div>
      <div className="row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }} aria-label="Filter by status">
          {FILTERS.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <ErrorNote error={error || action.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Attempts</th><th>Next follow-up</th><th></th></tr></thead>
          <tbody>
            {data?.leads.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/dashboard/leads/${l.id}`}><strong>{l.name}</strong></Link>{l.source && <div className="muted small">{l.source}</div>}{!l.consent && <div className="small" style={{ color: "var(--warning)" }}>No call consent</div>}</td>
                <td>{l.phone}</td>
                <td><StatusBadge status={l.status} /></td>
                <td>{l.attempts}</td>
                <td>{l.status === "new" && l.consent ? "Next run" : dateTime(l.nextFollowUpAt)}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => router.push(`/dashboard/practice?leadId=${l.id}`)}>Practice</button>
                    <button className="btn btn-sm" disabled={action.busy || !l.consent} onClick={() => callNow(l)}>Call now</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.leads.length === 0 && <tr><td colSpan={6} className="muted">No leads yet. Add one or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>
      {modal === "add" && <AddLead onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal === "import" && <ImportLeads onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function AddLead({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await run(() =>
      api("/api/v1/leads", {
        body: { name: f.get("name"), phone: f.get("phone"), email: f.get("email"), source: f.get("source"), notes: f.get("notes"), consent: f.get("consent") === "on" },
      }),
    );
    if (ok) onSaved();
  }
  return (
    <Modal title="Add lead" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Name<input name="name" required /></label>
        <label>Phone<input name="phone" required type="tel" placeholder="(555) 123-4567" /></label>
        <label>Email<input name="email" type="email" /></label>
        <label>Source<input name="source" placeholder="Website form, Google Ads, referral…" /></label>
        <label>Notes for the agent<textarea name="notes" placeholder="What they asked about" /></label>
        <label className="check"><input type="checkbox" name="consent" /> <span>This person agreed to be contacted by automated / AI phone calls from my business.</span></label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>Save lead</button>
      </form>
    </Modal>
  );
}

function ImportLeads({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useAction();
  const [result, setResult] = useState<{ imported: number; skipped: { line: number; reason: string }[] } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File;
    await run(async () => setResult(await api("/api/v1/leads/import", { body: { csv: await file.text(), consent: f.get("consent") === "on", source: f.get("source") || undefined } })));
  }
  return (
    <Modal title="Import leads from CSV" onClose={result ? onSaved : onClose}>
      {result ? (
        <div className="stack">
          <p className="alert alert-ok">Imported {result.imported} leads.</p>
          {result.skipped.length > 0 && <p className="muted small">Skipped: {result.skipped.map((s) => `line ${s.line} (${s.reason})`).join(", ")}</p>}
          <button className="btn btn-primary" onClick={onSaved}>Done</button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p className="muted small" style={{ margin: 0 }}>The first row must be a header with <code>name</code> and <code>phone</code> columns. <code>email</code> and <code>notes</code> are optional.</p>
          <label>CSV file<input name="file" type="file" accept=".csv,text/csv" required /></label>
          <label>Source<input name="source" placeholder="e.g. Trade show list" /></label>
          <label className="check"><input type="checkbox" name="consent" /> <span>Everyone in this file agreed to be contacted by automated / AI phone calls from my business.</span></label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={busy}>Import</button>
        </form>
      )}
    </Modal>
  );
}
