import { useState } from 'react';
import { router } from 'expo-router';
import { Switch } from 'react-native';
import { Button, Card, ErrorText, Field, Row, Screen, T, useAction } from '@/components/ui';
import { api } from '@/lib/api';

const today = () => new Date().toISOString().slice(0, 10);
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function NewInvoice() {
  const [form, setForm] = useState({ invoiceNumber: '', customerName: '', customerPhone: '', amount: '', issuedAt: today(), dueAt: today(), notes: '' });
  const [consent, setConsent] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const amount = Number(form.amount);
  const ready = form.invoiceNumber && form.customerName && form.customerPhone && amount > 0 && validDate(form.issuedAt) && validDate(form.dueAt);

  return (
    <Screen>
      <Field label="Invoice number" value={form.invoiceNumber} onChangeText={set('invoiceNumber')} autoCapitalize="characters" />
      <Field label="Customer name" value={form.customerName} onChangeText={set('customerName')} autoCapitalize="words" />
      <Field label="Customer phone" value={form.customerPhone} onChangeText={set('customerPhone')} keyboardType="phone-pad" />
      <Field label="Amount due ($)" value={form.amount} onChangeText={set('amount')} keyboardType="decimal-pad" />
      <Field label="Issued (YYYY-MM-DD)" value={form.issuedAt} onChangeText={set('issuedAt')} />
      <Field label="Due (YYYY-MM-DD)" value={form.dueAt} onChangeText={set('dueAt')} />
      <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      <Card>
        <Row>
          <T style={{ flex: 1 }}>This customer agreed to receive automated / AI phone calls from my business.</T>
          <Switch value={consent} onValueChange={setConsent} />
        </Row>
      </Card>
      <ErrorText error={error} />
      <Button
        title="Save invoice"
        variant="primary"
        busy={busy}
        disabled={!ready}
        onPress={async () => {
          const body = { ...form, amount, issuedAt: `${form.issuedAt}T12:00:00`, dueAt: `${form.dueAt}T12:00:00`, consent };
          if (await run(() => api('/api/v1/invoices', { body }))) router.back();
        }}
      />
    </Screen>
  );
}
