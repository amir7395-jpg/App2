import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, configureApi, tokenStore } from './api';
import type { User } from './types';

type AuthState = {
  loading: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    configureApi({ token: null, onUnauthorized: () => {} });
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { user } = await api<{ user: User }>('/api/auth/me');
    setUser(user);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await tokenStore.get();
      configureApi({ token, onUnauthorized: signOut });
      if (token) await refreshUser().catch(() => {});
      setLoading(false);
    })();
  }, [refreshUser, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { token, user } = await api<{ token: string; user: User }>('/api/auth/login', { body: { email, password } });
      await tokenStore.set(token);
      configureApi({ token, onUnauthorized: signOut });
      setUser(user);
    },
    [signOut],
  );

  const value = useMemo(() => ({ loading, user, signIn, signOut, refreshUser }), [loading, user, signIn, signOut, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
