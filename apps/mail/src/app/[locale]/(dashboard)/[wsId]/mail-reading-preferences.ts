'use client';

import { useSyncExternalStore } from 'react';
export type MailArchiveBehavior = 'next' | 'list';
const key = 'tuturuuu-mail-after-archive';
const listeners = new Set<() => void>();
let fallback: MailArchiveBehavior = 'next';
export function getMailArchiveBehavior(): MailArchiveBehavior {
  try {
    const value = window.localStorage.getItem(key);
    return value === 'next' || value === 'list' ? value : fallback;
  } catch {
    return fallback;
  }
}
export function setMailArchiveBehavior(value: MailArchiveBehavior) {
  fallback = value;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Retain in memory. */
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
