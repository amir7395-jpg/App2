"use client";

import { useEffect, useState } from "react";
import { ErrorNote, useAction, useApi } from "@/components/ui";
import { api, date } from "@/lib/client";
import type { BusinessHours } from "@/lib/db/schema";

type Settings = {
  name: string;
  timezone: string;
  ownerPhone: string | null;
  callerId: string | null;
  agentName: string;
  agentInstructions: string;
  appointmentMinutes: number;
  businessHours: BusinessHours;
  leadFollowUpHours: number;
  leadMaxAttempts: number;
  invoiceGraceDays: number;
  invoiceFollowUpDays: number;
  invoiceMaxAttempts: number;
  paymentLink: string | null;
  autopilot: boolean;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  hasBillingAccount: boolean;
  integrations: { telephony: boolean; agent: boolean; billing: boolean };
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsPage() {
  const { data, error } = useApi<{ settings: Settings }>("/api/v1/settings");
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  if (!s) return <ErrorNote error={error} />;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => { setSaved(false); setS({ ...s, [key]: value }); };
  const setHours = (day: number, value: { open: string; close: string } | null) => set("businessHours", { ...s.businessHours, [String(day)]: value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const ok = await action.run(async () => {
      const { settings } = await api<{ settings: Settings }>("/api/v1/settings", {
        method: "PATCH",
        body: {
          name: s.name, timezone: s.timezone, ownerPhone: s.ownerPhone || null, callerId: s.callerId || null, agentName: s.agentName,
          agentInstructions: s.agentInstructions, appointmentMinutes: s.appointmentMinutes, businessHours: s.businessHours,
          leadFollowUpHours: s.leadFollowUpHours, leadMaxAttempts: s.leadMaxAttempts, invoiceGraceDays: s.invoiceGraceDays,
          invoiceFollowUpDays: s.invoiceFollowUpDays, invoiceMaxAttempts: s.invoiceMaxAttempts, paymentLink: s.paymentLink || "", autopilot: s.autopilot,
        },
      });
      setS(settings);
    });
    setSaved(ok);
  }

  const num = (key: keyof Settings) => ({
    type: "number" as const,
    value: s[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as never),
  });

  return (
    <form className="stack" style={{ gap: 20, maxWidth: 820 }} onSubmit={save}>
      <div className="spread">
        <div><h1 className="page-title">Settings</h1><p className="muted" style={{ margin: 0 }}>How your agent talks, when it calls, and how persistent it is.</p></div>
        <button className="btn btn-primary" disabled={action.busy}>{action.busy ? "Saving…" : "Save changes"}</button>
      </div>
      <ErrorNote error={action.error} />
      {saved && <p className="alert alert-ok">Saved.</p>}

      <div className="card stack">
        <h3>Business</h3>
        <label>Business name<input value={s.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>Time zone<input value={s.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="America/New_York" /></label>
        <label>Your mobile number (for booking and escalation texts)<input type="tel" value={s.ownerPhone ?? ""} onChange={(e) => set("ownerPhone", e.target.value)} /></label>
        <label>Online payment link (texted to customers with overdue invoices)<input type="url" value={s.paymentLink ?? ""} onChange={(e) => set("paymentLink", e.target.value)} placeholder="https://…" /></label>
      </div>

      <div className="card stack">
        <h3>Agent</h3>
        <label>Agent first name<input value={s.agentName} onChange={(e) => set("agentName", e.target.value)} /></label>
        <label>
          What should the agent know?
          <textarea rows={8} value={s.agentInstructions} onChange={(e) => set("agentInstructions", e.target.value)}
            placeholder={"Services we offer, starting prices, service area, what to ask before booking, things never to promise…"} />
        </label>
        <label className="check"><input type="checkbox" checked={s.autopilot} onChange={(e) => set("autopilot", e.target.checked)} /> <span><strong>Autopilot</strong> — call new leads and overdue invoices automatically. Turn off to only call when you press &quot;Call now&quot;.</span></label>
      </div>

      <div className="card stack">
        <h3>Booking</h3>
        <label>Appointment length (minutes)<input {...num("appointmentMinutes")} min={10} max={480} /></label>
        <div className="stack" style={{ gap: 8 }}>
          {DAYS.map((name, d) => {
            const h = s.businessHours[String(d)];
            return (
              <div key={d} className="row">
                <label className="check" style={{ width: 150 }}><input type="checkbox" checked={Boolean(h)} onChange={(e) => setHours(d, e.target.checked ? { open: "09:00", close: "17:00" } : null)} /> {name}</label>
                {h ? (
                  <>
                    <input type="time" value={h.open} onChange={(e) => setHours(d, { ...h, open: e.target.value })} style={{ width: 130 }} aria-label={`${name} opens`} />
                    <span className="muted">to</span>
                    <input type="time" value={h.close} onChange={(e) => setHours(d, { ...h, close: e.target.value })} style={{ width: 130 }} aria-label={`${name} closes`} />
                  </>
                ) : <span className="muted small">Closed</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card stack">
        <h3>Follow-up rules</h3>
        <div className="grid grid-3">
          <label>Hours between lead follow-ups<input {...num("leadFollowUpHours")} min={1} /></label>
          <label>Max calls per lead<input {...num("leadMaxAttempts")} min={1} max={10} /></label>
          <label>Days overdue before invoice reminders<input {...num("invoiceGraceDays")} min={0} /></label>
          <label>Days between invoice reminders<input {...num("invoiceFollowUpDays")} min={1} /></label>
          <label>Max reminder calls per invoice<input {...num("invoiceMaxAttempts")} min={1} max={12} /></label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Calls are only placed between 9am and 8pm in your time zone, and only to contacts marked as having consented.</p>
      </div>

      <div className="card stack">
        <h3>Subscription</h3>
        <p style={{ margin: 0 }}>Status: <strong>{s.subscriptionStatus}</strong>{s.currentPeriodEnd ? ` · renews ${date(s.currentPeriodEnd)}` : ""}</p>
        {s.hasBillingAccount && (
          <div><button type="button" className="btn" onClick={() => action.run(async () => { const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" }); window.location.href = url; })}>Manage billing</button></div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Server integrations — phone: {s.integrations.telephony ? "connected" : "not configured"} · AI agent: {s.integrations.agent ? "connected" : "not configured"} · billing: {s.integrations.billing ? "connected" : "not configured"}
        </p>
      </div>
    </form>
  );
}
