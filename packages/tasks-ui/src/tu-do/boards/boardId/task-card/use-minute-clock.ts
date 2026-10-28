'use client';

import { useState, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let currentMinute = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    currentMinute = Date.now();
    timer = setInterval(() => {
      currentMinute = Date.now();
      for (const notify of listeners) notify();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const subscribeNever = () => () => undefined;
const getCurrentMinute = () => currentMinute;

/**
 * One shared clock that ticks every minute, so a card's overdue state follows
 * the time while the board stays open. Only enabled callers subscribe, which
 * keeps cards without an open due date from re-rendering; they read the time
 * they mounted at, since the shared value goes stale while nothing subscribes.
 */
export function useMinuteClock(enabled: boolean): number {
  const [mountedAt] = useState(() => Date.now());
  const shared = useSyncExternalStore(
    enabled ? subscribe : subscribeNever,
    getCurrentMinute,
    getCurrentMinute
  );
  return enabled ? shared : mountedAt;
}
