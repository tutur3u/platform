import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = Date.now();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer)
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * One shared one-second clock for countdowns. The server snapshot is the
 * render time the loader recorded, so hydration matches the HTML.
 */
export function useNow(serverNow: number) {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => serverNow
  );
}
