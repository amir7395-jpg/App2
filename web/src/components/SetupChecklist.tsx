"use client";

import Link from "next/link";
import { useApi } from "./ui";

type Settings = {
  agentInstructions: string;
  ownerPhone: string | null;
  integrations: { telephony: boolean; agent: boolean; billing: boolean };
};

/** Tells the owner what is still missing before the agent can make real calls. */
export function SetupChecklist() {
  const { data } = useApi<{ settings: Settings }>("/api/v1/settings");
  const qb = useApi<{ quickbooks: { connected: boolean } }>("/api/v1/quickbooks");
  if (!data || !qb.data) return null;
  const s = data.settings;
  const items = [
    { done: s.integrations.agent && s.integrations.telephony, label: "Phone line and AI agent connected (server configuration)" },
    { done: qb.data.quickbooks.connected, label: "Connect QuickBooks so overdue invoices are found automatically", href: "/dashboard/invoices" },
    { done: Boolean(s.agentInstructions.trim()), label: "Tell the agent about your services and prices", href: "/dashboard/settings" },
    { done: Boolean(s.ownerPhone), label: "Add your mobile number for booking alerts", href: "/dashboard/settings" },
  ];
  if (items.every((i) => i.done)) return null;
  return (
    <div className="card">
      <h3>Finish setting up</h3>
      <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 6 }}>
        {items.map((i) => (
          <li key={i.label}>
            {i.done ? "✅" : "⬜"} {i.href && !i.done ? <Link href={i.href}>{i.label}</Link> : i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
