"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorNote, useAction, useApi } from "@/components/ui";
import { api } from "@/lib/client";
import type { InvoiceDTO, LeadDTO } from "@/lib/types";
import { Transcript } from "@/components/Transcript";

type Turn = { callId: string; reply: string; ended: boolean };

function Practice() {
  const params = useSearchParams();
  const leads = useApi<{ leads: LeadDTO[] }>("/api/v1/leads");
  const invoices = useApi<{ invoices: InvoiceDTO[] }>("/api/v1/invoices");
  const [subject, setSubject] = useState(
    params.get("leadId") ? `lead:${params.get("leadId")}` : params.get("invoiceId") ? `invoice:${params.get("invoiceId")}` : "",
  );
  const [callId, setCallId] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [lines, setLines] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const { busy, error, run } = useAction();

  const start = () =>
    run(async () => {
      const [kind, id] = subject.split(":");
      const turn = await api<Turn>("/api/v1/simulate", { body: kind === "lead" ? { leadId: id } : { invoiceId: id } });
      setCallId(turn.callId);
      setEnded(turn.ended);
      setLines([{ role: "agent", content: turn.reply }]);
    });

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || !callId) return;
    setDraft("");
    setLines((l) => [...l, { role: "contact", content: message }]);
    void run(async () => {
      const turn = await api<Turn>("/api/v1/simulate", { body: { callId, message } });
      setEnded(turn.ended);
      setLines((l) => [...l, { role: "agent", content: turn.reply }, ...(turn.ended ? [{ role: "event", content: "Agent hung up" }] : [])]);
    });
  };

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 820 }}>
      <div>
        <h1 className="page-title">Practice call</h1>
        <p className="muted" style={{ margin: 0 }}>
          Play the lead or customer and type what they would say. This runs the real agent — appointments it books and statuses it sets are saved — but nobody is dialled or texted.
        </p>
      </div>
      <div className="card row">
        <select value={subject} onChange={(e) => { setSubject(e.target.value); setCallId(null); setLines([]); }} style={{ flex: 1, minWidth: 220 }} aria-label="Who to call">
          <option value="">Choose a lead or invoice…</option>
          <optgroup label="Leads">{leads.data?.leads.map((l) => <option key={l.id} value={`lead:${l.id}`}>{l.name} ({l.status.replace(/_/g, " ")})</option>)}</optgroup>
          <optgroup label="Invoices">{invoices.data?.invoices.filter((i) => i.status !== "paid").map((i) => <option key={i.id} value={`invoice:${i.id}`}>{i.invoiceNumber} — {i.customerName}</option>)}</optgroup>
        </select>
        <button className="btn btn-primary" disabled={!subject || busy} onClick={start}>{callId ? "Restart call" : "Start call"}</button>
      </div>
      <ErrorNote error={error} />
      {callId && (
        <div className="card stack">
          <Transcript messages={lines} />
          {busy && <p className="muted small" style={{ margin: 0 }}>Agent is thinking…</p>}
          {ended ? (
            <p className="muted" style={{ margin: 0 }}>Call ended. See the saved transcript and outcome under Calls.</p>
          ) : (
            <form className="row" onSubmit={send} style={{ flexWrap: "nowrap" }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say something…" autoFocus disabled={busy} />
              <button className="btn btn-primary" disabled={busy || !draft.trim()}>Send</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  return <Suspense><Practice /></Suspense>;
}
