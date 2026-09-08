'use client';
import { useSyncExternalStore } from 'react';
import { createMailLocalPreference } from './mail-local-preference';
export type MailArchiveBehavior = 'next' | 'list';
const preference = createMailLocalPreference<MailArchiveBehavior>(
  'tuturuuu-mail-after-archive',
  'next',
  ['next', 'list']
);
export const getMailArchiveBehavior = preference.getSnapshot;
export const setMailArchiveBehavior = preference.set;
export function useMailArchiveBehavior() {
  return [
    useSyncExternalStore(
      preference.subscribe,
      preference.getSnapshot,
      () => 'next' as const
    ),
    preference.set,
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
