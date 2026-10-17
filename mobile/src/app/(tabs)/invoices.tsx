import { router } from 'expo-router';
import { Alert } from 'react-native';
import { Badge, Button, Card, Empty, ErrorText, Row, Screen, T, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import type { Invoice } from '@/lib/types';

export default function Invoices() {
  const { data, error, reload, refresh, refreshing } = useApi<{ invoices: Invoice[] }>('/api/v1/invoices');
  const action = useAction();
  const markPaid = (inv: Invoice) =>
    action.run(async () => {
      await api(`/api/v1/invoices/${inv.id}`, { method: 'PATCH', body: { status: 'paid' } });
      await reload();
    });
  const remind = (inv: Invoice) =>
    Alert.alert('Call now?', `The agent will call ${inv.customerName} about ${inv.invoiceNumber}.`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Call',
        onPress: () =>
          action.run(async () => {
            await api(`/api/v1/invoices/${inv.id}/call`, { method: 'POST' });
            await reload();
          }),
      },
    ]);

  return (
    <Screen title="Invoices" refreshing={refreshing} onRefresh={refresh}>
      <Button title="Add invoice" variant="primary" onPress={() => router.push('/invoice-new')} />
      <ErrorText error={error || action.error} />
      {data?.invoices.map((inv) => (
        <Card key={inv.id}>
          <Row>
            <T bold>{inv.invoiceNumber} · {money(inv.amountCents, inv.currency)}</T>
            <Badge status={inv.status} />
          </Row>
          <T>{inv.customerName}</T>
          <T muted size={13}>
            Due {date(inv.dueAt)}
            {inv.status !== 'paid' && inv.daysOverdue > 0 ? ` · ${inv.daysOverdue} days overdue` : ''}
            {inv.collectionAttempts ? ` · ${inv.collectionAttempts} reminder calls` : ''}
          </T>
          {inv.status === 'promised' && inv.promisedPayDate && <T muted size={13}>Promised by {date(inv.promisedPayDate)}</T>}
          {inv.status !== 'paid' && (
            <Row style={{ marginTop: 4 }}>
              <Button title="Mark paid" onPress={() => markPaid(inv)} />
              <Button title="Remind now" disabled={!inv.consent} onPress={() => remind(inv)} />
            </Row>
          )}
        </Card>
      ))}
      {data?.invoices.length === 0 && <Empty>No invoices yet.</Empty>}
    </Screen>
  );
}
