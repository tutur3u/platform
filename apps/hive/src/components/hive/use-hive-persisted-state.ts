'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

type PersistedStateOptions<T> = {
  validate?: (value: unknown) => value is T;
};

export function useHivePersistedState<T>(
  key: string,
  initialValue: T,
  options: PersistedStateOptions<T> = {}
) {
  const [value, setValue] = useState(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storage = getLocalStorage();
    if (!storage) {
      setHydrated(true);
      return;
    }

    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (!options.validate || options.validate(parsed)) {
          setValue(parsed as T);
        }
      }
    } catch {
      storage.removeItem(key);
    } finally {
      setHydrated(true);
    }
  }, [key, options.validate]);

  useEffect(() => {
    if (!hydrated) return;

    const storage = getLocalStorage();
    if (!storage) return;

    try {
      storage.setItem(key, JSON.stringify(value));
    } catch {
      // Local preferences are best-effort; storage failures should not block editing.
    }
  }, [hydrated, key, value]);

  return [value, setValue] as const satisfies readonly [
    T,
    Dispatch<SetStateAction<T>>,
  ];
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function getLocalStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
