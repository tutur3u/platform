'use client';

import { useSyncExternalStore } from 'react';
export type MailArchiveBehavior = 'next' | 'list';
const key = 'tuturuuu-mail-after-archive';
const listeners = new Set<() => void>();
let fallback: MailArchiveBehavior = 'next';
let hasUnsavedPreference = false;
export function getMailArchiveBehavior(): MailArchiveBehavior {
  if (hasUnsavedPreference) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) fallback = 'next';
    if (value === 'next' || value === 'list') fallback = value;
    return fallback;
  } catch {
    return fallback;
  }
}
export function setMailArchiveBehavior(value: MailArchiveBehavior) {
  fallback = value;
  try {
    window.localStorage.setItem(key, value);
    hasUnsavedPreference = false;
  } catch {
    hasUnsavedPreference = true;
    /* Retain in memory. */
  }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      hasUnsavedPreference = false;
      if (event.newValue === null) fallback = 'next';
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
export function useMailArchiveBehavior() {
  return [
    useSyncExternalStore(
      subscribe,
      getMailArchiveBehavior,
      () => 'next' as const
    ),
    setMailArchiveBehavior,
  ] as const;
}
export function nextMailThreadId(
  threads: { id: string }[],
  current: string,
  removed: Set<string>
) {
  const index = threads.findIndex((thread) => thread.id === current);
  if (index < 0) return null;
  return (
    threads.slice(index + 1).find((thread) => !removed.has(thread.id))?.id ??
    threads
      .slice(0, index)
      .reverse()
      .find((thread) => !removed.has(thread.id))?.id ??
    null
  );
}
