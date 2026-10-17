import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Switch } from 'react-native';
import { Badge, Button, Card, ErrorText, Row, Screen, T, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime, label } from '@/lib/format';
import type { Appointment, Call, Lead } from '@/lib/types';

const STATUSES: Lead['status'][] = ['new', 'follow_up', 'appointment_set', 'not_interested', 'do_not_call'];

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload, refresh, refreshing } = useApi<{ lead: Lead; calls: Call[]; appointments: Appointment[] }>(`/api/v1/leads/${id}`);
  const action = useAction();
  if (!data) return <Screen><ErrorText error={error} /></Screen>;
  const { lead } = data;

  const patch = (body: Partial<Lead>) =>
    action.run(async () => {
      await api(`/api/v1/leads/${id}`, { method: 'PATCH', body });
      await reload();
    });
  const callNow = () =>
    Alert.alert('Call now?', `Your AI agent will call ${lead.name} right away.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Call', onPress: () => action.run(async () => { await api(`/api/v1/leads/${id}/call`, { method: 'POST' }); await reload(); }) },
    ]);
  const remove = () =>
    Alert.alert('Delete lead?', lead.name, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => action.run(async () => { await api(`/api/v1/leads/${id}`, { method: 'DELETE' }); router.back(); }) },
    ]);
  const pickStatus = () =>
    Alert.alert('Set status', undefined, [
      ...STATUSES.map((s) => ({ text: label(s), onPress: () => patch({ status: s }) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: lead.name }} />
      <ErrorText error={action.error} />
      <Card>
        <Row>
          <T bold size={20}>{lead.name}</T>
          <Badge status={lead.status} />
        </Row>
        <T muted onPress={() => void Linking.openURL(`tel:${lead.phone}`)}>{lead.phone}</T>
        {lead.email ? <T muted>{lead.email}</T> : null}
        <T muted size={13}>Calls: {lead.attempts} · Last: {dateTime(lead.lastContactedAt)} · Next: {dateTime(lead.nextFollowUpAt)}</T>
        {lead.notes ? <T>{lead.notes}</T> : null}
      </Card>
      <Card>
        <Row>
          <T style={{ flex: 1 }}>Consented to automated calls</T>
          <Switch value={lead.consent} onValueChange={(v) => void patch({ consent: v })} />
        </Row>
      </Card>
      <Button title="Have the agent call now" variant="primary" busy={action.busy} disabled={!lead.consent} onPress={callNow} />
      <Button title="Change status" onPress={pickStatus} />

      <T bold size={18}>Appointments</T>
      {data.appointments.length === 0 && <T muted>None yet.</T>}
      {data.appointments.map((a) => (
        <Card key={a.id}>
          <Row><T>{dateTime(a.startsAt)}</T><Badge status={a.status} /></Row>
        </Card>
      ))}

      <T bold size={18}>Calls</T>
      {data.calls.length === 0 && <T muted>No calls yet.</T>}
      {data.calls.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/call/${c.id}`)}>
          <Row><T>{dateTime(c.createdAt)}</T><Badge status={c.status} /></Row>
          {c.outcome ? <T muted size={13}>{c.outcome}</T> : null}
        </Card>
      ))}
      <Button title="Delete lead" variant="danger" onPress={remove} />
    </Screen>
  );
}
