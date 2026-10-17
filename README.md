# LeadLine — AI calling agent for small businesses

A subscription product ($50/month) with three parts:

| Part | Folder | What it is |
| --- | --- | --- |
| Website + dashboard + API | `web/` | Next.js app: marketing site and pricing, sign-up and Stripe checkout, the account-holder dashboard, the JSON API used by both apps, and the AI phone agent. |
| iPhone + Android app | `mobile/` | Expo (React Native) app for account holders: overview, leads, calendar, invoices and call transcripts. Uses the same API as the web dashboard. |

"LeadLine" is a placeholder name. Change it with `NEXT_PUBLIC_BRAND_NAME` (web) and `EXPO_PUBLIC_BRAND_NAME` plus `app.json` (mobile).

## What the agent does

- **Lead follow-up.** New leads that consented to automated calls get a call during calling hours. The agent introduces itself as an AI assistant, answers questions using only what the owner wrote in Settings, checks real availability and books an appointment. Missed calls get a voicemail and are retried every *N* hours (default 48) up to a maximum number of attempts (default 3).
- **Appointments.** Bookings only fall inside the business hours set in Settings, never overlap, and are at least 2 hours ahead. When telephony is configured, the lead and the owner each get an SMS confirmation.
- **Overdue invoices.** When an open invoice is past due by the grace period (default **30 days**), the agent makes a courtesy reminder call, repeated every *N* days (default 7) up to a maximum (default 4). It confirms identity before discussing the debt. It can text the business's payment link and record a promised pay date; if that date passes without payment, the invoice goes back in the queue. Disputes, "already paid", hardship and wrong-person cases go to the owner by SMS instead of being argued. The prompt forbids threats and any mention of collections, credit reporting or legal action, and the agent never takes card details by phone.
- **Practice call.** Dashboard → Practice call runs the real agent in a text chat, without dialling or texting anyone, so owners can tune its instructions.

### Guardrails built in

- Calls go only to contacts marked as consented. The owner confirms consent when adding or importing contacts.
- Calls are placed only between 9:00 and 20:00 in the business timezone.
- "Don't call me again" marks the contact do-not-call and removes their consent.
- Each scheduler run places at most 5 calls per business.

These are safeguards, not legal advice. AI-voiced calls are regulated in the US: the FCC's February 2024 ruling applies the TCPA's "artificial voice" rules to AI-generated voices. Have a lawyer review your consent language, the Terms and Privacy pages (currently placeholders), and the invoice-call script before launch.

## How it works

```
Browser / mobile app ──► Next.js API (/api/v1/*, cookie or Bearer token)
                              │
Cron every 15 min ──► /api/cron/tick ──► scheduler picks due leads and invoices
                              │                     │
                              │                     ▼
                              │            Twilio places the call
                              │                     │
            Twilio webhooks ──► /api/twilio/voice  ◄┘  speech → text each turn
                              │
                              ▼
                 Claude (Anthropic API) with tools:
                 check_availability, book_appointment, update_lead,
                 record_payment_promise, send_payment_link, flag_for_owner, end_call
```

- `web/src/lib/agent/` — prompts, tools and the turn loop. The Claude conversation is stored on each call and only ever appended to.
- `web/src/lib/scheduler.ts` — which leads and invoices are due.
- `web/src/lib/calls.ts` — placing calls, consent and calling-hour checks, and the follow-up bookkeeping after each call.
- `web/src/lib/billing.ts` — Stripe Checkout, the billing portal and the subscription webhook.
- The database is SQLite through Drizzle ORM. The schema is in `web/src/lib/db/schema.ts`; migrations live in `web/drizzle/` and run automatically on startup.

## Run it locally

```bash
cd web
cp .env.example .env.local      # then fill in what you have
npm install
npm run dev                     # http://localhost:3000
npm test                        # unit tests (scheduler, availability, compliance, agent loop)
```

- With `BILLING_DEV_BYPASS=true` (development only), "Continue to payment" activates the account without Stripe.
- Practice calls need only `ANTHROPIC_API_KEY`.
- Real phone calls also need the Twilio variables and a public HTTPS `PUBLIC_BASE_URL` (for example through a tunnel), because Twilio has to reach your webhooks.

Mobile:

```bash
cd mobile
cp .env.example .env            # EXPO_PUBLIC_API_URL = where the web app runs (use your computer's LAN IP, not localhost, on a phone)
npm install
npx expo start                  # scan the QR code with Expo Go, or press i / a for a simulator
```

## Going live: checklist

1. **Anthropic.** Create an API key and set `ANTHROPIC_API_KEY`. The agent uses `claude-opus-5-5` at low effort, to keep phone replies fast. It sets `fallbacks: "default"`, so a request the model declines on policy grounds is retried on Anthropic's recommended fallback model. Set `AGENT_MODEL` to change the model.
2. **Stripe.** Create a product with a recurring **$50/month** price, then set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`. Add a webhook endpoint at `https://YOUR_DOMAIN/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.created`/`updated`/`deleted`, and set `STRIPE_WEBHOOK_SECRET`. Turn on the Customer Portal so owners can cancel or update their card.
3. **Twilio.** Buy a voice- and SMS-capable number, then set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. The app sends Twilio the webhook URLs with each call, so no number configuration is needed. In the US, texting from a 10-digit long code requires A2P 10DLC registration.
4. **Hosting.** The app uses SQLite, so it needs a server with a persistent disk: a VPS, Render or Railway with a volume, or Fly.io with a volume. It will not work on serverless platforms such as Vercel, where the filesystem is temporary. Run `npm run build && npm start`, then set `SESSION_SECRET`, `PUBLIC_BASE_URL` and `DATABASE_PATH` (on the persistent volume).
5. **Scheduler.** Every 15 minutes, call `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/tick` from crontab, a GitHub Actions schedule, or your host's cron feature.
6. **Mobile stores.** In `mobile/app.json`, change `bundleIdentifier` and `package` (currently `com.example.leadline`), the name and the icons. Set `EXPO_PUBLIC_API_URL`, then build and submit with EAS: `npx eas-cli@latest build -p ios|android` and `npx eas-cli@latest submit`. You need an Apple Developer account ($99/year) and a Google Play developer account ($25 one-time).
   - The app has no sign-up or purchase screens. Accounts are created and paid for on the website, and the app only logs in. Apple's guidelines generally require in-app purchase for digital subscriptions *sold inside* the app, so keep purchasing on the web and check the current App Store Review Guidelines (section 3.1) before submitting.

## Costs to plan for

The $50 price has to cover per-account variable costs: Twilio voice minutes, SMS and the phone number, plus Anthropic API tokens for every conversational turn. Measure both on real calls (Twilio console usage; `usage` on Anthropic responses) before deciding on usage limits.

## Known limitations

- **Latency.** Each reply is a full Claude request inside Twilio's speech-gather loop, so expect a pause of a few seconds before the agent speaks. If that matters, the next step is a streaming voice pipeline (for example Twilio ConversationRelay or Media Streams with streamed replies).
- **One login per business.** There are no team members or roles yet.
- **The mobile app is for monitoring and quick actions.** Agent settings, CSV import and practice calls are on the web dashboard only.
- **No accounting integration.** Invoices are entered by hand (web or mobile) and marked paid by hand. QuickBooks/Xero sync and Stripe-invoice import would be natural next steps.
- **Calling hours use the business timezone,** not each contact's own timezone.
