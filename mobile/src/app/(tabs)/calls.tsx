import { router } from 'expo-router';
import { Badge, Card, Empty, ErrorText, Row, Screen, T, useApi } from '@/components/ui';
import { dateTime } from '@/lib/format';
import type { Call } from '@/lib/types';

export default function Calls() {
  const { data, error, refresh, refreshing } = useApi<{ calls: Call[] }>('/api/v1/calls');
  return (
    <Screen title="Calls" refreshing={refreshing} onRefresh={refresh}>
      <ErrorText error={error} />
      {data?.calls.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/call/${c.id}`)}>
          <Row>
            <T bold>{c.contactName}</T>
            <Badge status={c.status} />
          </Row>
          <T muted size={13}>
            {c.purpose === 'lead' ? 'Lead follow-up' : `Invoice ${c.invoiceNumber ?? ''}`} · {dateTime(c.createdAt)}
            {c.mode === 'simulation' ? ' · practice' : ''}
          </T>
          {c.outcome ? <T size={13}>{c.outcome}</T> : null}
        </Card>
      ))}
      {data?.calls.length === 0 && <Empty>No calls yet.</Empty>}
    </Screen>
  );
}
