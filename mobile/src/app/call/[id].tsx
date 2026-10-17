import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Badge, Card, ErrorText, Row, Screen, T, useApi } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { dateTime } from '@/lib/format';
import type { Call, CallMessage } from '@/lib/types';

export default function CallDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useApi<{ call: Call; transcript: CallMessage[] }>(`/api/v1/calls/${id}`);
  const t = useTheme();
  if (!data) return <Screen><ErrorText error={error} /></Screen>;
  const { call, transcript } = data;

  return (
    <Screen>
      <Stack.Screen options={{ title: call.purpose === 'lead' ? 'Lead call' : 'Invoice call' }} />
      <Card>
        <Row>
          <T bold>{call.toPhone}</T>
          <Badge status={call.status} />
        </Row>
        <T muted size={13}>{dateTime(call.startedAt ?? call.createdAt)}{call.mode === 'simulation' ? ' · practice' : ''}</T>
        {call.outcome ? <T>{call.outcome}</T> : null}
      </Card>
      {transcript.length === 0 && <T muted>No transcript.</T>}
      {transcript.map((m) =>
        m.role === 'event' ? (
          <T key={m.id} muted size={12} style={{ textAlign: 'center' }}>• {m.content}</T>
        ) : (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === 'agent' ? 'flex-start' : 'flex-end',
              maxWidth: '85%',
              backgroundColor: m.role === 'agent' ? t.primarySoft : t.surface2,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}>
            <T>{m.content}</T>
          </View>
        ),
      )}
    </Screen>
  );
}
