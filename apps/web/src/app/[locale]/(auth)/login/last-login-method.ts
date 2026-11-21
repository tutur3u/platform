'use client';

import { useSyncExternalStore } from 'react';

/** Sign-in methods the first step can offer, in default order. */
export const LOGIN_METHODS = [
  'google',
  'email',
  'passkey',
  'apple',
  'github',
  'azure',
] as const;

export type LoginMethod = (typeof LOGIN_METHODS)[number];

/**
 * The first step always shows this many methods, so a remembered method only
 * changes which method fills a slot, never how many rows the step has.
 */
export const PRIMARY_METHOD_COUNT = 3;
const DEFAULT_PRIMARY_METHODS: readonly LoginMethod[] = [
  'google',
  'email',
  'passkey',
];

const STORAGE_KEY = 'tuturuuu:last-login-method';
const listeners = new Set<() => void>();

function isLoginMethod(value: unknown): value is LoginMethod {
  return LOGIN_METHODS.some((method) => method === value);
}

/** Per-device convenience only; storage may be unavailable or cleared. */
export function readLastLoginMethod(): LoginMethod | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLoginMethod(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberLoginMethod(method: LoginMethod) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, method);
  } catch {
    // Private windows and blocked storage keep the default order.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab remembering a method updates this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  globalThis.addEventListener?.('storage', onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}

export function useLastLoginMethod() {
  return useSyncExternalStore(subscribe, readLastLoginMethod, () => null);
}

/**
 * Orders the first step: the last-used method first, then Google, email and
 * passkey, always PRIMARY_METHOD_COUNT methods. Every other method goes
 * behind the disclosure, so a returning staff member whose last method was
 * Microsoft sees it on the first step.
 */
export function arrangeLoginMethods(lastUsed: LoginMethod | null) {
  const primary = [
    ...(lastUsed ? [lastUsed] : []),
    ...DEFAULT_PRIMARY_METHODS.filter((method) => method !== lastUsed),
  ].slice(0, PRIMARY_METHOD_COUNT);
  const more = LOGIN_METHODS.filter((method) => !primary.includes(method));
  return { more, primary };
}
