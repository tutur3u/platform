'use client';

import { getUserConfig } from '@tuturuuu/internal-api/users';
import { useEffect, useLayoutEffect } from 'react';
import {
  applySorbetUi,
  EXPERIMENTAL_SORBET_UI_CONFIG_ID,
  parseSorbetUiValue,
  readStoredSorbetUi,
  SORBET_UI_CHANGE_EVENT,
  SORBET_UI_STORAGE_KEY,
} from './sorbet-ui';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Re-reads the account value at most this often when the window regains focus. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Keeps `<html data-ui>` in step with the account's experimental Sorbet setting.
 *
 * Mount once per app, next to the theme provider. It needs no query client: it
 * applies the device's last known value first, then the account value, and
 * follows changes made in this tab, in other tabs, and in other apps (on focus).
 * Signed-out visitors keep the device value; a failed read changes nothing.
 */
export function ExperimentalUiSync() {
  useIsomorphicLayoutEffect(() => {
    const stored = readStoredSorbetUi();
    if (stored !== null) applySorbetUi(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastFetch = 0;

    const refresh = async () => {
      lastFetch = Date.now();
      try {
        const { value } = await getUserConfig(EXPERIMENTAL_SORBET_UI_CONFIG_ID);
        if (!cancelled) applySorbetUi(parseSorbetUiValue(value));
      } catch {
        // Not signed in, offline, or the read failed: keep the current value.
      }
    };

    const onFocus = () => {
      if (Date.now() - lastFetch >= REFRESH_INTERVAL_MS) void refresh();
    };
    const onLocalChange = (event: Event) => {
      applySorbetUi(Boolean((event as CustomEvent<boolean>).detail));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SORBET_UI_STORAGE_KEY && event.newValue !== null) {
        applySorbetUi(event.newValue === 'true');
      }
    };

    void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}
