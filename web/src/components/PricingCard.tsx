import Link from "next/link";
import { PLAN } from "@/lib/config";

export const PLAN_FEATURES = [
  "AI agent calls new leads and follows up automatically",
  "Books appointments straight onto your calendar",
  "Reminds customers about invoices 30+ days overdue",
  "Texts payment links and appointment confirmations",
  "Full call transcripts and outcomes",
  "Web dashboard plus iPhone and Android apps",
  "Cancel anytime",
];

export function PricingCard() {
  return (
    <div className="card price-card">
      <h3>{PLAN.name} plan</h3>
      <div className="price">
        ${PLAN.priceCents / 100}
        <small> / month</small>
      </div>
      <p className="muted">Everything included for one business. No setup fees, no contracts.</p>
      <ul className="checklist">
        {PLAN_FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Link href="/signup" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
        Start now
      </Link>
    </div>
  );
}
