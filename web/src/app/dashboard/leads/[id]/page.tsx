"use client";

import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, StatusBadge, useAction, useApi } from "@/components/ui";
import { api, dateTime } from "@/lib/client";
import type { AppointmentDTO, CallDTO, LeadDTO } from "@/lib/types";

const STATUSES = ["new", "contacted", "follow_up", "appointment_set", "not_interested", "unreachable", "do_not_call"];

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = useApi<{ lead: LeadDTO; calls: CallDTO[]; appointments: AppointmentDTO[] }>(`/api/v1/leads/${id}`);
  const action = useAction();
  const router = useRouter();
  if (!data) return <ErrorNote error={error} />;
  const { lead } = data;

  const patch = (body: Partial<LeadDTO>) => action.run(async () => { await api(`/api/v1/leads/${id}`, { method: "PATCH", body }); await reload(); });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link href="/dashboard/leads" className="small">← Leads</Link>
      <div className="spread">
        <div>
          <h1 className="page-title">{lead.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => router.push(`/dashboard/practice?leadId=${lead.id}`)}>Practice call</button>
          <button className="btn btn-danger" onClick={async () => { if (confirm("Delete this lead?") && (await action.run(() => api(`/api/v1/leads/${id}`, { method: "DELETE" })))) router.push("/dashboard/leads"); }}>Delete</button>
        </div>
      </div>
      <ErrorNote error={action.error} />
      <div className="grid grid-3">
        <div className="card stack">
          <label>Status
            <select value={lead.status} onChange={(e) => patch({ status: e.target.value as LeadDTO["status"] })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={lead.consent} onChange={(e) => patch({ consent: e.target.checked })} /> <span>Consented to automated calls</span></label>
          <div className="small muted">Attempts: {lead.attempts} · Last contacted: {dateTime(lead.lastContactedAt)} · Next follow-up: {dateTime(lead.nextFollowUpAt)}</div>
        </div>
        <div className="card stack">
          <h3>Notes</h3>
          <form onSubmit={(e) => { e.preventDefault(); patch({ notes: String(new FormData(e.currentTarget).get("notes")) }); }} className="stack">
            <textarea name="notes" defaultValue={lead.notes} key={lead.notes} />
            <button className="btn btn-sm" disabled={action.busy}>Save notes</button>
          </form>
        </div>
        <div className="card">
          <h3>Appointments</h3>
          {data.appointments.map((a) => <div key={a.id} className="spread small" style={{ padding: "6px 0" }}><span>{dateTime(a.startsAt)}</span><StatusBadge status={a.status} /></div>)}
          {data.appointments.length === 0 && <p className="muted small">None yet.</p>}
        </div>
      </div>
      <div>
        <h3>Call history</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Status</th><th>Outcome</th></tr></thead>
            <tbody>
              {data.calls.map((c) => (
                <tr key={c.id}><td><Link href={`/dashboard/calls/${c.id}`}>{dateTime(c.createdAt)}</Link>{c.mode === "simulation" && <div className="muted small">practice</div>}</td><td><StatusBadge status={c.status} /></td><td className="small">{c.outcome ?? "—"}</td></tr>
              ))}
              {data.calls.length === 0 && <tr><td colSpan={3} className="muted">No calls yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
