'use client';

/** Primitive snapshots stay stable and never write storage during rendering. */
export function createMailLocalPreference<T extends string>(
  key: string,
  defaultValue: T,
  values: readonly T[]
) {
  let fallback = defaultValue;
  let pendingWrite = false;
  const listeners = new Set<() => void>();
  const parse = (value: string | null) =>
    value === null
      ? defaultValue
      : values.includes(value as T)
        ? (value as T)
        : fallback;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      window.localStorage.setItem(key, fallback);
      pendingWrite = false;
    } catch {
      pendingWrite = true;
    }
  };
  const getSnapshot = () => {
    if (pendingWrite) return fallback;
    try {
      return parse(window.localStorage.getItem(key));
    } catch {
      return fallback;
    }
  };
  const refresh = () => {
    if (pendingWrite) persist();
    else fallback = getSnapshot();
    notify();
  };
  const set = (value: T) => {
    fallback = value;
    persist();
    notify();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage)
        return;
    } catch {
      // The event still carries the new value when storage access is blocked.
    }
    fallback = parse(event.newValue);
    pendingWrite = false;
    notify();
  };
  const subscribe = (listener: () => void) => {
    // Subscribe/focus are side-effect paths: retry a transient failed write here.
    if (listeners.size === 0) {
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', refresh);
      refresh();
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('focus', refresh);
      }
    };
  };
  return { getSnapshot, set, subscribe };
}
