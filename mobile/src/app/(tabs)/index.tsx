import { router } from 'expo-router';
import { View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorText, Row, Screen, T, useApi } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import type { Appointment, Call, Stats } from '@/lib/types';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <T muted size={13}>{label}</T>
      <T size={26} bold>{value}</T>
      {sub ? <T muted size={12}>{sub}</T> : null}
    </Card>
  );
}

export default function Overview() {
  const { user, signOut } = useAuth();
  if (!user?.subscriptionActive) {
    return (
      <Screen title="Overview">
        <Card>
          <T bold>Your subscription isn&apos;t active</T>
          <T muted>Manage your plan from your account on our website, then pull down to refresh.</T>
        </Card>
        <Button title="Log out" onPress={signOut} />
      </Screen>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const { user, signOut } = useAuth();
  const stats = useApi<Stats>('/api/v1/stats');
  const appts = useApi<{ appointments: Appointment[] }>('/api/v1/appointments');
  const calls = useApi<{ calls: Call[] }>('/api/v1/calls');
  const s = stats.data;
  const refresh = () => Promise.all([stats.refresh(), appts.refresh(), calls.refresh()]);

  return (
    <Screen title="Overview" refreshing={stats.refreshing} onRefresh={refresh}>
      <T muted>{user?.business.name}</T>
      <ErrorText error={stats.error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }}>
        <Stat label="Open leads" value={s ? String(s.openLeads) : '–'} />
        <Stat label="Upcoming" value={s ? String(s.upcomingAppointments) : '–'} sub="appointments" />
        <Stat label="Calls this week" value={s ? String(s.callsThisWeek) : '–'} sub={s ? `${s.agentBookingsThisWeek} booked by agent` : undefined} />
        <Stat label="Overdue 30+ days" value={s ? money(s.overdueAmountCents) : '–'} sub={s ? `${s.overdueInvoices} invoices` : undefined} />
      </View>

      <T bold size={18}>Next appointments</T>
      {appts.data?.appointments.filter((a) => a.status === 'scheduled').slice(0, 3).map((a) => (
        <Card key={a.id}>
          <T bold>{a.lead?.name ?? a.title}</T>
          <T muted>{dateTime(a.startsAt)}</T>
        </Card>
      ))}
      {appts.data && !appts.data.appointments.some((a) => a.status === 'scheduled') && <Empty>No upcoming appointments.</Empty>}

      <T bold size={18}>Recent calls</T>
      {calls.data?.calls.slice(0, 4).map((c) => (
        <Card key={c.id} onPress={() => router.push(`/call/${c.id}`)}>
          <Row>
            <T bold>{c.contactName}</T>
            <Badge status={c.status} />
          </Row>
          <T muted size={13}>{c.purpose === 'lead' ? 'Lead follow-up' : `Invoice ${c.invoiceNumber ?? ''}`} · {dateTime(c.createdAt)}</T>
        </Card>
      ))}
      {calls.data?.calls.length === 0 && <Empty>No calls yet.</Empty>}
      <Button title="Log out" onPress={signOut} />
    </Screen>
  );
}
