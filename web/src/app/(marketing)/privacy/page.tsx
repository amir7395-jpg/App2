import { config } from "@/lib/config";

export const metadata = { title: "Privacy" };
export default function Privacy() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Privacy policy</h1>
        <p className="alert alert-warn">Placeholder — replace with a policy reviewed by your lawyer before launch.</p>
        <p>
          {config.brandName} stores the account, lead, appointment, invoice and call information you add so the AI agent can
          place calls on your behalf. Call audio is processed by our telephony provider to transcribe speech, and call
          transcripts are processed by our AI provider to generate the agent&apos;s replies. We do not sell personal data.
        </p>
      </div>
    </section>
  );
}
