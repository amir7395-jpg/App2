import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/** Weekly opening hours in the business's timezone. Day keys are 0 (Sun) – 6 (Sat). */
export type BusinessHours = Record<string, { open: string; close: string } | null>;

export const businesses = sqliteTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  ownerPhone: text("owner_phone"),
  callerId: text("caller_id"),
  agentName: text("agent_name").notNull().default("Alex"),
  agentInstructions: text("agent_instructions").notNull().default(""),
  appointmentMinutes: integer("appointment_minutes").notNull().default(30),
  businessHours: text("business_hours", { mode: "json" }).$type<BusinessHours>().notNull(),
  leadFollowUpHours: integer("lead_follow_up_hours").notNull().default(48),
  leadMaxAttempts: integer("lead_max_attempts").notNull().default(3),
  invoiceGraceDays: integer("invoice_grace_days").notNull().default(30),
  invoiceFollowUpDays: integer("invoice_follow_up_days").notNull().default(7),
  invoiceMaxAttempts: integer("invoice_max_attempts").notNull().default(4),
  paymentLink: text("payment_link"),
  autopilot: integer("autopilot", { mode: "boolean" }).notNull().default(true),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").notNull().default("none"),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: id(),
  businessId: text("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "follow_up",
  "appointment_set",
  "not_interested",
  "do_not_call",
  "unreachable",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leads = sqliteTable(
  "leads",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    source: text("source"),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<LeadStatus>().notNull().default("new"),
    /** Prior express consent to receive automated/AI calls (required by the TCPA in the US). */
    consent: integer("consent", { mode: "boolean" }).notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    lastContactedAt: integer("last_contacted_at", { mode: "timestamp_ms" }),
    nextFollowUpAt: integer("next_follow_up_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("leads_business_idx").on(t.businessId, t.status)],
);

export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointments = sqliteTable(
  "appointments",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").$type<AppointmentStatus>().notNull().default("scheduled"),
    notes: text("notes").notNull().default(""),
    bookedBy: text("booked_by").$type<"agent" | "user">().notNull().default("user"),
    createdAt: createdAt(),
  },
  (t) => [index("appointments_business_idx").on(t.businessId, t.startsAt)],
);

export const INVOICE_STATUSES = ["open", "promised", "paid", "disputed", "written_off"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_SOURCES = ["manual", "quickbooks"] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    source: text("source").$type<InvoiceSource>().notNull().default("manual"),
    /** QuickBooks Invoice.Id for imported invoices. */
    externalId: text("external_id"),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull(),
    /** Null when the QuickBooks customer has no usable phone number (the invoice can't be called). */
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    /** Amount still owed (QuickBooks Balance for imported invoices). */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("open"),
    consent: integer("consent", { mode: "boolean" }).notNull().default(false),
    promisedPayDate: integer("promised_pay_date", { mode: "timestamp_ms" }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    collectionAttempts: integer("collection_attempts").notNull().default(0),
    lastCollectionAt: integer("last_collection_at", { mode: "timestamp_ms" }),
    notes: text("notes").notNull().default(""),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoices_business_idx").on(t.businessId, t.status),
    uniqueIndex("invoices_external_idx").on(t.businessId, t.source, t.externalId),
  ],
);

/** One QuickBooks Online company linked to a business (OAuth 2.0). Tokens are stored encrypted. */
export const quickbooksConnections = sqliteTable("quickbooks_connections", {
  businessId: text("business_id")
    .primaryKey()
    .references(() => businesses.id, { onDelete: "cascade" }),
  realmId: text("realm_id").notNull(),
  companyName: text("company_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }).notNull(),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }).notNull(),
  /** Owner confirms their QuickBooks customers agreed to automated/AI calls about their account. */
  customersConsented: integer("customers_consented", { mode: "boolean" }).notNull().default(false),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  lastSyncError: text("last_sync_error"),
  lastSyncImported: integer("last_sync_imported"),
  connectedAt: createdAt(),
});

export const CALL_STATUSES = [
  "queued",
  "in_progress",
  "completed",
  "no_answer",
  "voicemail",
  "failed",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export type CallPurpose = "lead" | "invoice";

export const calls = sqliteTable(
  "calls",
  {
    id: id(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<CallPurpose>().notNull(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    toPhone: text("to_phone").notNull(),
    mode: text("mode").$type<"phone" | "simulation">().notNull().default("phone"),
    status: text("status").$type<CallStatus>().notNull().default("queued"),
    twilioCallSid: text("twilio_call_sid"),
    outcome: text("outcome"),
    /** Raw Claude conversation, kept append-only so it can be replayed turn by turn. */
    history: text("history", { mode: "json" }).$type<BetaMessageParam[]>().notNull().default([]),
    ended: integer("ended", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("calls_business_idx").on(t.businessId, t.createdAt)],
);

export const callMessages = sqliteTable(
  "call_messages",
  {
    id: id(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    role: text("role").$type<"agent" | "contact" | "event">().notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("call_messages_call_idx").on(t.callId, t.createdAt)],
);

export type Business = typeof businesses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type QuickBooksConnection = typeof quickbooksConnections.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type CallMessage = typeof callMessages.$inferSelect;
