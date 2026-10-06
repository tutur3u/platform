'use client';
import type { Awareness } from '@tuturuuu/realtime/documents';
import { Avatar, AvatarFallback } from '@tuturuuu/ui/avatar';
import { useTranslations } from 'next-intl';
import { useMemo, useSyncExternalStore } from 'react';

type Collaborator = { id: string; name: string };
const EMPTY: readonly Collaborator[] = [];

export function readDocumentCollaborators(awareness: Awareness) {
  const users = new Map<string, Collaborator>();
  for (const state of awareness.getStates().values()) {
    const user: unknown = state.user;
    if (!user || typeof user !== 'object') continue;
    const { id, name } = user as Record<string, unknown>;
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      id.length > 128 ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 200
    )
      continue;
    users.set(id, { id, name: name.trim() });
  }
  return [...users.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Awareness belongs to the active document provider, never the meeting roster. */
export function DocumentPresence({
  awareness,
  connected,
}: {
  awareness: Awareness;
  connected: boolean;
}) {
  const t = useTranslations('meet.collaboration');
  const store = useMemo(() => {
    let snapshot: readonly Collaborator[] =
      readDocumentCollaborators(awareness);
    return {
      getSnapshot: () => snapshot,
      subscribe: (notify: () => void) => {
        const update = () => {
          snapshot = readDocumentCollaborators(awareness);
          notify();
        };
        awareness.on('change', update);
        update();
        return () => awareness.off('change', update);
      },
    };
  }, [awareness]);
  const users = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY
  );
  if (!connected || !users.length) return null;
  return (
    <ul
      className="flex shrink-0 items-center -space-x-2"
      aria-label={t('document_presence', { count: users.length })}
    >
      {users.slice(0, 4).map((user) => (
        <li key={user.id}>
          <Avatar
            className="size-7 border-2 border-background"
            title={user.name}
            aria-label={user.name}
          >
            <AvatarFallback className="text-xs">
              {Array.from(user.name)[0]?.toLocaleUpperCase()}
            </AvatarFallback>
          </Avatar>
        </li>
      ))}
      {users.length > 4 && (
        <li
          className="rounded-full border bg-background px-1.5 text-xs"
          title={users
            .slice(4)
            .map((user) => user.name)
            .join(', ')}
        >
          +{users.length - 4}
        </li>
      )}
    </ul>
  );
}
