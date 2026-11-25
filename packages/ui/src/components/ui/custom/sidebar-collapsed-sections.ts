'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

export const SIDEBAR_COLLAPSED_SECTIONS_STORAGE_KEY =
  'tuturuuu:sidebar:collapsed-sections:v1';

const listeners = new Set<() => void>();

function readRaw(storageKey: string): string {
  try {
    return window.localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
}

export function parseCollapsedSectionIds(raw: string): string[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return [
      ...new Set(
        parsed.filter((item): item is string => typeof item === 'string')
      ),
    ];
  } catch {
    return [];
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Remembers which sidebar sections the user collapsed. Storage can be missing
 * or blocked (private windows, cleared data), so every access is guarded and
 * the sidebar simply renders every section expanded when it is unavailable.
 * The server snapshot is "nothing collapsed", so first paint never shifts.
 */
export function useCollapsedSidebarSections(
  storageKey: string = SIDEBAR_COLLAPSED_SECTIONS_STORAGE_KEY
) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(storageKey),
    () => ''
  );
  const collapsedIds = useMemo(() => parseCollapsedSectionIds(raw), [raw]);

  const toggleSection = useCallback(
    (sectionId: string) => {
      const current = parseCollapsedSectionIds(readRaw(storageKey));
      const next = current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId];

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage is unavailable; the toggle is a no-op rather than an error.
      }

      for (const listener of listeners) listener();
    },
    [storageKey]
  );

  return { collapsedIds, toggleSection };
}
