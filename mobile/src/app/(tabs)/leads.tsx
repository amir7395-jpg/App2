import { router } from 'expo-router';
import { Badge, Button, Card, Empty, ErrorText, Row, Screen, T, useApi } from '@/components/ui';
import { dateTime } from '@/lib/format';
import type { Lead } from '@/lib/types';

export default function Leads() {
  const { data, error, refresh, refreshing } = useApi<{ leads: Lead[] }>('/api/v1/leads');
  return (
    <Screen title="Leads" refreshing={refreshing} onRefresh={refresh}>
      <Button title="Add lead" variant="primary" onPress={() => router.push('/lead-new')} />
      <ErrorText error={error} />
      {data?.leads.map((l) => (
        <Card key={l.id} onPress={() => router.push(`/lead/${l.id}`)}>
          <Row>
            <T bold>{l.name}</T>
            <Badge status={l.status} />
          </Row>
          <T muted size={13}>{l.phone}{l.source ? ` · ${l.source}` : ''}</T>
          <T muted size={13}>
            {l.attempts} call{l.attempts === 1 ? '' : 's'}
            {l.nextFollowUpAt ? ` · next ${dateTime(l.nextFollowUpAt)}` : ''}
            {!l.consent ? ' · no call consent' : ''}
          </T>
        </Card>
      ))}
      {data?.leads.length === 0 && <Empty>No leads yet. Add your first one above.</Empty>}
    </Screen>
  );
}
