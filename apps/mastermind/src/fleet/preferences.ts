import { useSyncExternalStore } from 'react';

/** Per-device display preferences; nothing here affects what Web records. */
const KEY = 'mastermind.show-fyi.v1';
const listeners = new Set<() => void>();

function read() {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
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

export function setShowFyi(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    return;
  }
  for (const listener of listeners) listener();
}

export function useShowFyi() {
  return useSyncExternalStore(subscribe, read, () => true);
}

const noop = () => () => {};
/** False during the server render and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}
