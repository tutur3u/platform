import { useSyncExternalStore } from 'react';

/**
 * Snooze is per device: Web has no per-owner snooze record, so a snoozed ask
 * hides only in this browser and returns on its own at the chosen time. The
 * phone and WhatsApp keep showing it, and its deadline still applies.
 */
export const SNOOZE_STORAGE_KEY = 'mastermind.snoozes.v1';

export const snoozeChoices = ['15m', '1h', 'morning', 'deadline'] as const;
export type SnoozeChoice = (typeof snoozeChoices)[number];

const LEAD_MS = 5 * 60_000;

/** When a snooze ends, or null when the choice cannot apply. */
export function snoozeUntil(
  choice: SnoozeChoice,
  now: number,
  deadlineAt?: string
): number | null {
  switch (choice) {
    case '15m':
      return now + 15 * 60_000;
    case '1h':
      return now + 60 * 60_000;
    case 'morning': {
      const next = new Date(now);
      next.setHours(8, 0, 0, 0);
      if (next.getTime() <= now) next.setDate(next.getDate() + 1);
      return next.getTime();
    }
    case 'deadline': {
      if (!deadlineAt) return null;
      const until = Date.parse(deadlineAt) - LEAD_MS;
      return until > now + 60_000 ? until : null;
    }
  }
}

/** Drops malformed and expired entries; caps the record at 100 ids. */
export function parseSnoozes(raw: string | null, now: number) {
  const result: Record<string, number> = {};
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object') return result;
    for (const [id, until] of Object.entries(value).slice(0, 100)) {
      if (typeof until === 'number' && until > now) result[id] = until;
    }
  } catch {
    // Unreadable storage reads as no snoozes.
  }
  return result;
}

const EMPTY: Record<string, number> = {};
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Record<string, number> } | null = null;

function read(): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SNOOZE_STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (!cache || cache.raw !== raw)
    cache = { raw, value: parseSnoozes(raw, Date.now()) };
  return cache.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function setSnooze(id: string, until: number | null) {
  const next = { ...read() };
  if (until === null) delete next[id];
  else next[id] = until;
  try {
    window.localStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

export function useSnoozes() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
