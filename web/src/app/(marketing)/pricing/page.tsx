import type { Metadata } from "next";
import { PricingCard } from "@/components/PricingCard";

export const metadata: Metadata = { title: "Pricing" };

export default async function Pricing({ searchParams }: { searchParams: Promise<{ canceled?: string; subscribe?: string }> }) {
  const sp = await searchParams;
  return (
    <section className="section">
      <div className="container">
        <h2>Pricing</h2>
        <p className="subtitle">One plan with everything. $50 per month, billed monthly. Cancel anytime.</p>
        {sp.canceled && <p className="alert alert-warn" style={{ maxWidth: 440, margin: "0 auto 20px" }}>Checkout was canceled — you haven&apos;t been charged.</p>}
        {sp.subscribe && <p className="alert" style={{ maxWidth: 440, margin: "0 auto 20px" }}>Your account is ready. Subscribe to start using the agent.</p>}
        <PricingCard />
      </div>
    </section>
  );
}
