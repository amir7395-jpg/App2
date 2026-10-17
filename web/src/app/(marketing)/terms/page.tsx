import { config } from "@/lib/config";

export const metadata = { title: "Terms" };
export default function Terms() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Terms of service</h1>
        <p className="alert alert-warn">Placeholder — replace with terms reviewed by your lawyer before launch.</p>
        <p>
          By using {config.brandName} you confirm that every person you ask the agent to call has given prior express consent
          to receive automated or AI-voiced calls from your business, and that you will comply with telemarketing,
          do-not-call and debt-collection laws that apply to you.
        </p>
      </div>
    </section>
  );
}
