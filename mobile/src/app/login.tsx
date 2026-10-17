import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Button, ErrorText, Field, T, useAction } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { Spacing } from '@/constants/theme';

const BRAND = process.env.EXPO_PUBLIC_BRAND_NAME ?? 'LeadLine';

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.background, justifyContent: 'center', padding: Spacing.five }}>
      <View style={{ gap: Spacing.four }}>
        <View style={{ gap: Spacing.one }}>
          <T size={30} bold>{BRAND}</T>
          <T muted>Your AI agent for leads, appointments and overdue invoices.</T>
        </View>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
        <ErrorText error={error} />
        <Button title="Log in" variant="primary" busy={busy} disabled={!email || !password} onPress={() => run(() => signIn(email.trim(), password))} />
        {/* Accounts and subscriptions are created on the website, not in the app. */}
        <T muted size={13} style={{ textAlign: 'center' }}>Use the email and password you signed up with on our website.</T>
      </View>
    </KeyboardAvoidingView>
  );
}
