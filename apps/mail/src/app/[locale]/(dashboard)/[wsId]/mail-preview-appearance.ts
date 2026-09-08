'use client';

import { useSyncExternalStore } from 'react';
import type { MailMessagePreviewMode } from './mail-message-preview-utils';

const key = 'tuturuuu-mail-message-appearance';
const listeners = new Set<() => void>();
let fallback: MailMessagePreviewMode = 'dark';

export function getMailPreviewAppearance(): MailMessagePreviewMode {
  try {
    const saved = window.localStorage.getItem(key);
    return saved === 'dark' || saved === 'original' ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function setMailPreviewAppearance(mode: MailMessagePreviewMode) {
  fallback = mode;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // Keep the preference across message navigation even when storage is blocked.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
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
