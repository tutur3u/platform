'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { useEffect, useLayoutEffect } from 'react';
import {
  applySorbetTheme,
  parseSorbetTheme,
  readStoredSorbetTheme,
  SORBET_THEME_CHANGE_EVENT,
  SORBET_THEME_CONFIG_ID,
  SORBET_THEME_STORAGE_KEY,
} from './sorbet-theme';
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

/** The account values are re-read on window focus once they are this old. */
const ACCOUNT_VALUE_STALE_MS = 60_000;

/**
 * Applies the device's last known values, then follows changes made in this
 * tab and in other tabs.
 */
function DeviceSync() {
  useIsomorphicLayoutEffect(() => {
    const stored = readStoredSorbetUi();
    if (stored !== null) applySorbetUi(stored);
    const storedTheme = readStoredSorbetTheme();
    if (storedTheme !== null) applySorbetTheme(storedTheme);
  }, []);

  useEffect(() => {
    const onLocalChange = (event: Event) => {
      applySorbetUi(Boolean((event as CustomEvent<boolean>).detail));
    };
    const onLocalThemeChange = (event: Event) => {
      applySorbetTheme(
        parseSorbetTheme((event as CustomEvent<unknown>).detail)
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.newValue === null) return;
      if (event.key === SORBET_UI_STORAGE_KEY) {
        applySorbetUi(event.newValue === 'true');
      } else if (event.key === SORBET_THEME_STORAGE_KEY) {
        applySorbetTheme(parseSorbetTheme(event.newValue));
      }
    };

    window.addEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
    window.addEventListener(SORBET_THEME_CHANGE_EVENT, onLocalThemeChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
      window.removeEventListener(SORBET_THEME_CHANGE_EVENT, onLocalThemeChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}

const ACCOUNT_QUERY_OPTIONS = {
  refetchOnWindowFocus: true,
  retry: false,
  staleTime: ACCOUNT_VALUE_STALE_MS,
} as const;

/** Reads the account values through the shared user-config queries. */
function AccountSync() {
  const { data: enabled } = useUserConfig(
    EXPERIMENTAL_SORBET_UI_CONFIG_ID,
    '',
    ACCOUNT_QUERY_OPTIONS
  );
  const { data: theme } = useUserConfig(
    SORBET_THEME_CONFIG_ID,
    '',
    ACCOUNT_QUERY_OPTIONS
  );

  useEffect(() => {
    if (enabled !== undefined) applySorbetUi(parseSorbetUiValue(enabled));
  }, [enabled]);

  useEffect(() => {
    if (theme !== undefined) applySorbetTheme(parseSorbetTheme(theme));
  }, [theme]);

  return null;
}

/**
 * Keeps `<html>` in step with the account's experimental Sorbet setting and
 * Sorbet theme.
 *
 * It applies the device's last known values first, then the account values,
 * which it shares through the query cache with the Appearance settings and
 * re-reads on focus once stale, so changes made in other apps follow. A failed
 * read changes nothing and is not retried.
 *
 * With `account` (the default) it must be mounted inside a
 * `QueryClientProvider`. Pass `account={false}` where the page knows there is
 * no signed-in account: the device values and cross-tab changes still apply,
 * no account value is requested, and no query client is needed.
 */
export function ExperimentalUiSync({ account = true }: { account?: boolean }) {
  return (
    <>
      <DeviceSync />
      {account && <AccountSync />}
    </>
  );
}
