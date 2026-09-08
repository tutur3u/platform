'use client';

import { useSyncExternalStore } from 'react';
import type { MailMessagePreviewMode } from './mail-message-preview-utils';

const key = 'tuturuuu-mail-message-appearance';
const listeners = new Set<() => void>();
let fallback: MailMessagePreviewMode = 'dark';
let hasUnsavedPreference = false;

export function getMailPreviewAppearance(): MailMessagePreviewMode {
  if (hasUnsavedPreference) return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    if (saved === null) fallback = 'dark';
    if (saved === 'dark' || saved === 'original') fallback = saved;
    return fallback;
  } catch {
    return fallback;
  }
}

export function setMailPreviewAppearance(mode: MailMessagePreviewMode) {
  fallback = mode;
  try {
    window.localStorage.setItem(key, mode);
    hasUnsavedPreference = false;
  } catch {
    hasUnsavedPreference = true;
    // Keep the preference across message navigation even when storage is blocked.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      hasUnsavedPreference = false;
      if (event.newValue === null) fallback = 'dark';
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useMailPreviewAppearance() {
  const mode = useSyncExternalStore(
    subscribe,
    getMailPreviewAppearance,
    () => 'dark' as const
  );
  return [mode, setMailPreviewAppearance] as const;
}
