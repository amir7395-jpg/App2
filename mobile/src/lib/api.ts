import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Base URL of the web app's API. Set EXPO_PUBLIC_API_URL in mobile/.env (e.g. https://app.example.com). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'session_token';

/** Session token lives in the iOS Keychain / Android Keystore (localStorage only for web previews). */
export const tokenStore =
  Platform.OS === 'web'
    ? {
        get: async () => globalThis.localStorage?.getItem(TOKEN_KEY) ?? null,
        set: async (token: string) => globalThis.localStorage?.setItem(TOKEN_KEY, token),
        clear: async () => globalThis.localStorage?.removeItem(TOKEN_KEY),
      }
    : {
        get: () => SecureStore.getItemAsync(TOKEN_KEY),
        set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
        clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
      };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function configureApi(opts: { token: string | null; onUnauthorized: () => void }) {
  currentToken = opts.token;
  onUnauthorized = opts.onUnauthorized;
}

/** JSON request against the shared web API, authenticated with the stored bearer token. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(currentToken ? { authorization: `Bearer ${currentToken}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && currentToken) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}
