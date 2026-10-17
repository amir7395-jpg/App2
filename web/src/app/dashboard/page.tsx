"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApi, StatusBadge, ErrorNote } from "@/components/ui";
import { dateTime, money } from "@/lib/client";
import type { AppointmentDTO, CallDTO, Stats } from "@/lib/types";
import { SetupChecklist } from "@/components/SetupChecklist";

function Welcome() {
  return useSearchParams().get("welcome") ? (
    <p className="alert alert-ok">You&apos;re subscribed — welcome aboard! Start by telling the agent about your business in Settings.</p>
  ) : null;
}

export default function Overview() {
  const stats = useApi<Stats>("/api/v1/stats");
  const appts = useApi<{ appointments: AppointmentDTO[] }>("/api/v1/appointments");
  const calls = useApi<{ calls: CallDTO[] }>("/api/v1/calls");
  const s = stats.data;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="muted">What your AI agent has been up to.</p>
      </div>
      <Suspense><Welcome /></Suspense>
      <SetupChecklist />
      <ErrorNote error={stats.error} />
      <div className="grid grid-4">
        <div className="card"><div className="muted small">Open leads</div><div className="stat">{s?.openLeads ?? "–"}</div></div>
        <div className="card"><div className="muted small">Upcoming appointments</div><div className="stat">{s?.upcomingAppointments ?? "–"}</div></div>
        <div className="card"><div className="muted small">Calls this week</div><div className="stat">{s?.callsThisWeek ?? "–"}</div><div className="muted small">{s ? `${s.agentBookingsThisWeek} booked by agent` : ""}</div></div>
        <div className="card"><div className="muted small">Overdue 30+ days</div><div className="stat">{s ? money(s.overdueAmountCents) : "–"}</div><div className="muted small">{s ? `${s.overdueInvoices} invoices · ${money(s.recoveredAmountCents)} recovered` : ""}</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <div className="card">
          <div className="spread"><h3>Next appointments</h3><Link href="/dashboard/appointments" className="small">All</Link></div>
          {appts.data?.appointments.filter((a) => a.status === "scheduled").slice(0, 5).map((a) => (
            <div key={a.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div><strong>{a.lead?.name ?? a.title}</strong><div className="muted small">{dateTime(a.startsAt)}</div></div>
              {a.bookedBy === "agent" && <span className="badge badge-blue">by agent</span>}
            </div>
          ))}
          {appts.data && appts.data.appointments.length === 0 && <p className="muted">No appointments yet.</p>}
        </div>
        <div className="card">
          <div className="spread"><h3>Recent calls</h3><Link href="/dashboard/calls" className="small">All</Link></div>
          {calls.data?.calls.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/dashboard/calls/${c.id}`} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--border)", color: "inherit" }}>
              <div><strong>{c.contactName}</strong><div className="muted small">{c.purpose === "lead" ? "Lead follow-up" : `Invoice ${c.invoiceNumber ?? ""}`} · {dateTime(c.createdAt)}</div></div>
              <StatusBadge status={c.status} />
            </Link>
          ))}
          {calls.data && calls.data.calls.length === 0 && <p className="muted">No calls yet.</p>}
        </div>
      </div>
    </div>
  );
}
