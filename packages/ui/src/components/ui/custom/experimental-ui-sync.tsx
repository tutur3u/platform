'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { useEffect, useLayoutEffect } from 'react';
import {
  applyNavLabels,
  NAV_LABELS_CHANGE_EVENT,
  NAV_LABELS_STORAGE_KEY,
  parseNavLabelsValue,
  readStoredNavLabels,
  SIDEBAR_NAV_LABELS_CONFIG_ID,
} from './nav-labels';
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
  SORBET_UI_DEFAULT,
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
    applySorbetUi(readStoredSorbetUi() ?? SORBET_UI_DEFAULT);
    const storedTheme = readStoredSorbetTheme();
    if (storedTheme !== null) applySorbetTheme(storedTheme);
    const storedNavLabels = readStoredNavLabels();
    if (storedNavLabels !== null) applyNavLabels(storedNavLabels);
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
    const onLocalNavLabelsChange = (event: Event) => {
      applyNavLabels(Boolean((event as CustomEvent<boolean>).detail));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.newValue === null) return;
      if (event.key === SORBET_UI_STORAGE_KEY) {
        applySorbetUi(parseSorbetUiValue(event.newValue));
      } else if (event.key === SORBET_THEME_STORAGE_KEY) {
        applySorbetTheme(parseSorbetTheme(event.newValue));
      } else if (event.key === NAV_LABELS_STORAGE_KEY) {
        applyNavLabels(event.newValue === 'true');
      }
    };

    window.addEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
    window.addEventListener(SORBET_THEME_CHANGE_EVENT, onLocalThemeChange);
    window.addEventListener(NAV_LABELS_CHANGE_EVENT, onLocalNavLabelsChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SORBET_UI_CHANGE_EVENT, onLocalChange);
      window.removeEventListener(SORBET_THEME_CHANGE_EVENT, onLocalThemeChange);
      window.removeEventListener(
        NAV_LABELS_CHANGE_EVENT,
        onLocalNavLabelsChange
      );
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
  const { data: navLabels } = useUserConfig(
    SIDEBAR_NAV_LABELS_CONFIG_ID,
    '',
    ACCOUNT_QUERY_OPTIONS
  );

  useEffect(() => {
    if (enabled !== undefined) applySorbetUi(parseSorbetUiValue(enabled));
  }, [enabled]);

  useEffect(() => {
    if (theme !== undefined) applySorbetTheme(parseSorbetTheme(theme));
  }, [theme]);

  useEffect(() => {
    if (navLabels !== undefined) applyNavLabels(parseNavLabelsValue(navLabels));
  }, [navLabels]);

  return null;
}

/**
 * Keeps `<html>` in step with the account's Sorbet design choice (on unless
 * turned off), Sorbet theme and collapsed-sidebar label choice
 * (`nav-labels.ts`).
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
