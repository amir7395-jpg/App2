"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";
import { Logo } from "./SiteHeader";

const ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/practice", label: "Practice call" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar({ businessName }: { businessName: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  return (
    <aside className="sidebar">
      <Logo />
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={`nav-item${active(i.href) ? " active" : ""}`}>
          {i.label}
        </Link>
      ))}
      <div className="spacer" />
      <div className="muted small" style={{ padding: "8px 12px" }}>{businessName}</div>
      <button
        className="btn btn-sm"
        onClick={async () => {
          await api("/api/auth/logout", { method: "POST" });
          window.location.href = "/";
        }}
      >
        Log out
      </button>
    </aside>
  );
}
