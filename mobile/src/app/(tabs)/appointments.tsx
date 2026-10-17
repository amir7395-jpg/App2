import { Alert } from 'react-native';
import { Badge, Button, Card, Empty, ErrorText, Row, Screen, T, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { Appointment } from '@/lib/types';

export default function Appointments() {
  const { data, error, reload, refresh, refreshing } = useApi<{ appointments: Appointment[] }>('/api/v1/appointments');
  const action = useAction();
  const setStatus = (a: Appointment, status: Appointment['status']) =>
    action.run(async () => {
      await api(`/api/v1/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      await reload();
    });
  const cancel = (a: Appointment) =>
    Alert.alert('Cancel appointment?', a.lead?.name ?? a.title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: () => setStatus(a, 'cancelled') },
    ]);

  return (
    <Screen title="Calendar" refreshing={refreshing} onRefresh={refresh}>
      <ErrorText error={error || action.error} />
      {data?.appointments.map((a) => (
        <Card key={a.id}>
          <Row>
            <T bold>{a.lead?.name ?? a.title}</T>
            <Badge status={a.status} />
          </Row>
          <T>{dateTime(a.startsAt)}</T>
          {a.lead && <T muted size={13}>{a.lead.phone}</T>}
          {a.bookedBy === 'agent' && <T muted size={13}>Booked by your AI agent</T>}
          {a.notes ? <T muted size={13}>{a.notes}</T> : null}
          {a.status === 'scheduled' && (
            <Row style={{ marginTop: 4 }}>
              <Button title="Done" onPress={() => setStatus(a, 'completed')} />
              <Button title="No-show" onPress={() => setStatus(a, 'no_show')} />
              <Button title="Cancel" variant="danger" onPress={() => cancel(a)} />
            </Row>
          )}
        </Card>
      ))}
      {data?.appointments.length === 0 && <Empty>No upcoming appointments.</Empty>}
    </Screen>
  );
}
