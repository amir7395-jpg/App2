"use client";

import Link from "next/link";
import { use } from "react";
import { ErrorNote, StatusBadge, useApi } from "@/components/ui";
import { dateTime } from "@/lib/client";
import type { CallDTO, CallMessageDTO } from "@/lib/types";
import { Transcript } from "@/components/Transcript";

export default function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useApi<{ call: CallDTO; transcript: CallMessageDTO[] }>(`/api/v1/calls/${id}`);
  if (!data) return <ErrorNote error={error} />;
  const { call } = data;
  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <Link href="/dashboard/calls" className="small">← Calls</Link>
      <div className="spread">
        <div>
          <h1 className="page-title">Call to {call.toPhone}</h1>
          <p className="muted" style={{ margin: 0 }}>{call.purpose === "lead" ? "Lead follow-up" : "Invoice reminder"} · {dateTime(call.startedAt ?? call.createdAt)}{call.mode === "simulation" ? " · practice" : ""}</p>
        </div>
        <StatusBadge status={call.status} />
      </div>
      {call.outcome && <div className="card"><strong>Outcome:</strong> {call.outcome}</div>}
      <div className="card"><Transcript messages={data.transcript} /></div>
    </div>
  );
}
