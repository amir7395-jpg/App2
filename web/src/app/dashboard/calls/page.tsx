"use client";

import Link from "next/link";
import { ErrorNote, StatusBadge, useApi } from "@/components/ui";
import { dateTime } from "@/lib/client";
import type { CallDTO } from "@/lib/types";

export default function Calls() {
  const { data, error } = useApi<{ calls: CallDTO[] }>("/api/v1/calls");
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h1 className="page-title">Calls</h1>
        <p className="muted" style={{ margin: 0 }}>Every call the agent made, with outcome and transcript.</p>
      </div>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Contact</th><th>Purpose</th><th>Status</th><th>Outcome</th></tr></thead>
          <tbody>
            {data?.calls.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/dashboard/calls/${c.id}`}>{dateTime(c.createdAt)}</Link>{c.mode === "simulation" && <div className="muted small">practice</div>}</td>
                <td>{c.contactName}<div className="muted small">{c.toPhone}</div></td>
                <td>{c.purpose === "lead" ? "Lead follow-up" : `Invoice ${c.invoiceNumber ?? ""}`}</td>
                <td><StatusBadge status={c.status} /></td>
                <td className="small">{c.outcome ?? "—"}</td>
              </tr>
            ))}
            {data && data.calls.length === 0 && <tr><td colSpan={5} className="muted">No calls yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
