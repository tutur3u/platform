'use client';

import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function getSnapshot() {
  return Math.floor(Date.now() / MINUTE_MS);
}

function getServerSnapshot() {
  // Server and hydration must share a deterministic snapshot; React then reads now.
  return 0;
}

function scheduleTick() {
  timer = setTimeout(
    () => {
      timer = undefined;
      for (const listener of listeners) listener();
      if (listeners.size) scheduleTick();
    },
    MINUTE_MS - (Date.now() % MINUTE_MS)
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) scheduleTick();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

/** One minute clock shared by every calendar view; selected days stay immutable. */
export function useCalendarClock(): Date {
  const minute = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  return new Date(minute * MINUTE_MS);
}
