import type { Appointment, Call, CallMessage, Invoice, Lead } from "./db/schema";

/** JSON-over-the-wire versions of DB rows (dates arrive as ISO strings). */
type Wire<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export type LeadDTO = Wire<Lead>;
export type AppointmentDTO = Wire<Appointment> & { lead: { id: string; name: string; phone: string } | null };
export type InvoiceDTO = Wire<Invoice> & { daysOverdue: number; inCollections: boolean };
export type CallDTO = Omit<Wire<Call>, "history"> & { contactName?: string; invoiceNumber?: string | null };
export type CallMessageDTO = Wire<CallMessage>;
export type QuickBooksStatus =
  | { connected: false; available: boolean; environment: string }
  | {
      connected: true;
      available: boolean;
      environment: string;
      companyName: string | null;
      realmId: string;
      customersConsented: boolean;
      lastSyncAt: string | null;
      lastSyncError: string | null;
      lastSyncImported: number | null;
      needsReconnect: boolean;
    };

export type Stats = {
  openLeads: number;
  upcomingAppointments: number;
  callsThisWeek: number;
  agentBookingsThisWeek: number;
  overdueInvoices: number;
  overdueAmountCents: number;
  recoveredAmountCents: number;
};
