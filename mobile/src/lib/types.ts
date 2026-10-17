/** Shapes returned by the web API (see web/src/lib/types.ts). Dates are ISO strings. */
export type User = {
  id: string;
  email: string;
  name: string;
  business: { id: string; name: string };
  subscriptionStatus: string;
  subscriptionActive: boolean;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  notes: string;
  status: 'new' | 'contacted' | 'follow_up' | 'appointment_set' | 'not_interested' | 'do_not_call' | 'unreachable';
  consent: boolean;
  attempts: number;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
};

export type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notes: string;
  bookedBy: 'agent' | 'user';
  lead: { id: string; name: string; phone: string } | null;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  amountCents: number;
  currency: string;
  dueAt: string;
  status: 'open' | 'promised' | 'paid' | 'disputed' | 'written_off';
  consent: boolean;
  promisedPayDate: string | null;
  collectionAttempts: number;
  notes: string;
  daysOverdue: number;
  inCollections: boolean;
};

export type Call = {
  id: string;
  purpose: 'lead' | 'invoice';
  toPhone: string;
  mode: 'phone' | 'simulation';
  status: string;
  outcome: string | null;
  createdAt: string;
  startedAt: string | null;
  contactName?: string;
  invoiceNumber?: string | null;
};

export type CallMessage = { id: string; role: 'agent' | 'contact' | 'event'; content: string };

export type Stats = {
  openLeads: number;
  upcomingAppointments: number;
  callsThisWeek: number;
  agentBookingsThisWeek: number;
  overdueInvoices: number;
  overdueAmountCents: number;
  recoveredAmountCents: number;
};
