import Link from "next/link";
import { PricingCard } from "@/components/PricingCard";
import { config } from "@/lib/config";

const FEATURES = [
  {
    icon: "☎",
    title: "Calls every lead, fast",
    body: "New leads get a friendly call from your AI agent within minutes, during business hours. No more leads going cold in your inbox.",
  },
  {
    icon: "↻",
    title: "Follows up until there's an answer",
    body: "Missed the call? The agent leaves a voicemail and tries again on your schedule, then stops after the number of attempts you choose.",
  },
  {
    icon: "📅",
    title: "Books appointments for you",
    body: "The agent checks your real availability, offers open times, and books the slot. You and your customer both get a text confirmation.",
  },
  {
    icon: "$",
    title: "Chases overdue invoices from QuickBooks",
    body: "Connect QuickBooks Online once. Every hour we find unpaid invoices more than 30 days past due, and the agent calls with a polite reminder, texts a payment link, and records promised pay dates. No data entry.",
  },
  {
    icon: "⚑",
    title: "Hands tricky calls back to you",
    body: "Disputes, already-paid claims, or hardship are flagged to you right away instead of argued with. You stay in control of the relationship.",
  },
  {
    icon: "📋",
    title: "Every call on the record",
    body: "See every call, transcript, outcome, appointment and invoice in one dashboard, from any browser.",
  },
];

const FAQ = [
  {
    q: "Does the agent say it's an AI?",
    a: "Yes. Every call opens with the same fixed sentence — \"Hi, this is an automated call from an AI assistant named …, calling on behalf of [your business].\" — before anything else is said, including on voicemails. If someone asks whether they're talking to a person, the agent answers honestly.",
  },
  {
    q: "Who can the agent call?",
    a: "Only leads and customers who have given you consent to be contacted by automated calls. You confirm consent when you add or import contacts, and anyone who asks not to be called again is marked do-not-call automatically.",
  },
  {
    q: "When does it call?",
    a: "Between 9am and 8pm in your business's time zone, and appointments are only offered inside the business hours you set.",
  },
  {
    q: "How does invoice follow-up work?",
    a: "Connect your QuickBooks Online account and we check it every hour for unpaid invoices more than 30 days past due (you can change that number), along with the customer's phone number. The agent calls with a courtesy reminder and repeats on the interval you choose. When the payment is recorded in QuickBooks, the calls stop automatically. It never threatens, mentions collections, or takes card numbers over the phone.",
  },
  {
    q: "Can I try the agent before it calls real people?",
    a: "Yes. The dashboard has a practice mode where you play the lead or customer and chat with the agent, so you can tune what it says first.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime, from the billing page. Your plan stays active until the end of the period you paid for.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="badge badge-blue">AI phone agent for small businesses</span>
          <h1 style={{ marginTop: 20 }}>Never let a lead go cold — or an invoice go unpaid — again.</h1>
          <p className="lead">
            {config.brandName} gives you an AI agent that calls and follows up your leads, books appointments on your
            calendar, and reminds customers about invoices that are more than 30 days overdue.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/signup" className="btn btn-primary btn-lg">Get started for $50/month</Link>
            <Link href="#how" className="btn btn-lg">See how it works</Link>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <h2>Your always-on front desk</h2>
          <p className="subtitle">Everything a busy owner forgets to do between jobs, handled by an agent that never takes a day off.</p>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <div className="feature-icon" aria-hidden>{f.icon}</div>
                <h3>{f.title}</h3>
                <p className="muted" style={{ marginBottom: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="how" style={{ background: "var(--surface)" }}>
        <div className="container">
          <h2>Up and running in an afternoon</h2>
          <p className="subtitle">No phone system to install. Your agent calls from a dedicated local number.</p>
          <div className="grid grid-3 steps">
            <div className="card">
              <h3>Tell the agent about your business</h3>
              <p className="muted" style={{ marginBottom: 0 }}>Hours, services, prices, and anything it should or shouldn&apos;t say.</p>
            </div>
            <div className="card">
              <h3>Add leads and connect QuickBooks</h3>
              <p className="muted" style={{ marginBottom: 0 }}>Type leads in or import a CSV. Overdue invoices come straight from QuickBooks.</p>
            </div>
            <div className="card">
              <h3>Let it work</h3>
              <p className="muted" style={{ marginBottom: 0 }}>Appointments land on your calendar and you get a text for each booking or issue.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <h2>One simple plan</h2>
          <p className="subtitle">Less than the cost of one missed job a month.</p>
          <PricingCard />
        </div>
      </section>

      <section className="section faq">
        <div className="container" style={{ maxWidth: 760 }}>
          <h2>Questions</h2>
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
