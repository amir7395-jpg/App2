import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

/** Loads JSON from the API, reloads whenever the screen regains focus, supports pull-to-refresh. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, [path]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);
  return { data, error, reload: load, refresh, refreshing };
}

/** Scrollable page. Tab roots have no navigation header, so they pass `title` and get safe-area padding. */
export function Screen({ children, title, refreshing, onRefresh }: { children: React.ReactNode; title?: string; refreshing?: boolean; onRefresh?: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={{ padding: Spacing.four, paddingTop: title ? insets.top + Spacing.four : Spacing.four, gap: Spacing.three, paddingBottom: 120 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}>
      {title && <Text style={{ color: t.text, fontSize: 30, fontWeight: '800' }}>{title}</Text>}
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const s = [styles.card, { backgroundColor: t.surface, borderColor: t.border }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && { opacity: 0.7 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function T({ children, muted, size = 15, bold, style, onPress }: { children: React.ReactNode; muted?: boolean; size?: number; bold?: boolean; style?: object; onPress?: () => void }) {
  const t = useTheme();
  return <Text onPress={onPress} style={[{ color: muted ? t.textSecondary : t.text, fontSize: size, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}

const TONES: Record<string, 'blue' | 'green' | 'amber' | 'red'> = {
  new: 'blue', contacted: 'blue', follow_up: 'amber', appointment_set: 'green', do_not_call: 'red',
  scheduled: 'blue', completed: 'green', no_show: 'red',
  open: 'amber', promised: 'blue', paid: 'green', disputed: 'red',
  in_progress: 'blue', no_answer: 'amber', voicemail: 'amber', failed: 'red',
};

function toneColors(t: Palette, tone?: string) {
  switch (tone) {
    case 'blue': return [t.primarySoft, t.primary];
    case 'green': return [t.successSoft, t.success];
    case 'amber': return [t.warningSoft, t.warning];
    case 'red': return [t.dangerSoft, t.danger];
    default: return [t.surface2, t.textSecondary];
  }
}

export function Badge({ status }: { status: string }) {
  const t = useTheme();
  const [bg, fg] = toneColors(t, TONES[status]);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'default', disabled, busy }: { title: string; onPress: () => void; variant?: 'default' | 'primary' | 'danger'; disabled?: boolean; busy?: boolean }) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? t.primary : t.surface, borderColor: primary ? t.primary : t.border },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? t.primaryInk : t.text} />
      ) : (
        <Text style={{ color: primary ? t.primaryInk : variant === 'danger' ? t.danger : t.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function ErrorText({ error }: { error?: string }) {
  const t = useTheme();
  if (!error) return null;
  return (
    <View style={[styles.alert, { backgroundColor: t.dangerSoft }]}>
      <Text style={{ color: t.danger }}>{error}</Text>
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <T muted>{children}</T>
    </Card>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }, style]}>{children}</View>;
}

/** Runs an async action, tracking busy/error state for buttons and forms. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}


const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: Spacing.four, gap: Spacing.two },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  alert: { borderRadius: 10, padding: Spacing.three },
});
