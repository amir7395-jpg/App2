"use client";

import { useState } from "react";
import Link from "next/link";
import { ErrorNote, Modal, StatusBadge, useAction, useApi } from "@/components/ui";
import { api } from "@/lib/client";
import type { AppointmentDTO } from "@/lib/types";

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function Appointments() {
  const { data, error, reload } = useApi<{ appointments: AppointmentDTO[] }>("/api/v1/appointments");
  const [adding, setAdding] = useState(false);
  const action = useAction();
  const groups = new Map<string, AppointmentDTO[]>();
  for (const a of data?.appointments ?? []) groups.set(dayKey(a.startsAt), [...(groups.get(dayKey(a.startsAt)) ?? []), a]);

  const setStatus = (a: AppointmentDTO, status: string) =>
    action.run(async () => { await api(`/api/v1/appointments/${a.id}`, { method: "PATCH", body: { status } }); await reload(); });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="spread">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="muted" style={{ margin: 0 }}>The agent only books inside your business hours and never double-books.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add appointment</button>
      </div>
      <ErrorNote error={error || action.error} />
      {[...groups.entries()].map(([day, items]) => (
        <div key={day}>
          <h3>{day}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td style={{ width: 140 }}>
                      <strong>{new Date(a.startsAt).toLocaleTimeString(undefined, { timeStyle: "short" })}</strong>
                      <div className="muted small">to {new Date(a.endsAt).toLocaleTimeString(undefined, { timeStyle: "short" })}</div>
                    </td>
                    <td>
                      {a.lead ? <Link href={`/dashboard/leads/${a.lead.id}`}><strong>{a.lead.name}</strong></Link> : <strong>{a.title}</strong>}
                      {a.lead && <div className="muted small">{a.lead.phone}</div>}
                      {a.notes && <div className="small">{a.notes}</div>}
                    </td>
                    <td>{a.bookedBy === "agent" && <span className="badge badge-blue">booked by agent</span>}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>
                      {a.status === "scheduled" && (
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => setStatus(a, "completed")}>Done</button>
                          <button className="btn btn-sm" onClick={() => setStatus(a, "no_show")}>No-show</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setStatus(a, "cancelled")}>Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {data && data.appointments.length === 0 && <p className="muted">No upcoming appointments.</p>}
      {adding && <AddAppointment onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function AddAppointment({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { busy, error, run } = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await run(() =>
      api("/api/v1/appointments", {
        body: { title: f.get("title"), startsAt: new Date(String(f.get("startsAt"))).toISOString(), durationMinutes: Number(f.get("duration")), notes: f.get("notes") },
      }),
    );
    if (ok) onSaved();
  }
  return (
    <Modal title="Add appointment" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Title<input name="title" required placeholder="Estimate for Jane" /></label>
        <label>Starts<input name="startsAt" type="datetime-local" required /></label>
        <label>Duration (minutes)<input name="duration" type="number" defaultValue={30} min={5} max={480} /></label>
        <label>Notes<textarea name="notes" /></label>
        <ErrorNote error={error} />
        <button className="btn btn-primary" disabled={busy}>Save</button>
      </form>
    </Modal>
  );
}
