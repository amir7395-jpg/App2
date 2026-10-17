import { useState } from 'react';
import { router } from 'expo-router';
import { Switch } from 'react-native';
import { Button, Card, ErrorText, Field, Row, Screen, T, useAction } from '@/components/ui';
import { api } from '@/lib/api';

export default function NewLead() {
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: '', notes: '' });
  const [consent, setConsent] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <Screen>
      <Field label="Name" value={form.name} onChangeText={set('name')} autoCapitalize="words" />
      <Field label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" textContentType="telephoneNumber" />
      <Field label="Email (optional)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Source (optional)" value={form.source} onChangeText={set('source')} placeholder="Website, referral, ad…" />
      <Field label="Notes for the agent" value={form.notes} onChangeText={set('notes')} multiline placeholder="What they asked about" />
      <Card>
        <Row>
          <T style={{ flex: 1 }}>This person agreed to be contacted by automated / AI phone calls from my business.</T>
          <Switch value={consent} onValueChange={setConsent} />
        </Row>
      </Card>
      <ErrorText error={error} />
      <Button
        title="Save lead"
        variant="primary"
        busy={busy}
        disabled={!form.name || !form.phone}
        onPress={async () => {
          if (await run(() => api('/api/v1/leads', { body: { ...form, consent } }))) router.back();
        }}
      />
    </Screen>
  );
}
