'use client';

import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import { setCookie } from 'cookies-next';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { AppOpenMode } from './apps-launcher-catalog';

export const APP_OPEN_MODE_PREFERENCE_KEY = 'tuturuuu-apps-launcher-open-mode';

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function isAppOpenMode(value: unknown): value is AppOpenMode {
  return value === 'current-tab' || value === 'new-tab';
}

export function readAppsLauncherCookie(name: string) {
  if (typeof document === 'undefined') return null;

  const encodedName = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(encodedName));

  if (!cookie) return null;

  try {
    return decodeURIComponent(cookie.slice(encodedName.length));
  } catch {
    return null;
  }
}

function readLegacyPreference() {
  if (typeof window === 'undefined') return null;

  try {
    const storedValue = window.localStorage.getItem(
      APP_OPEN_MODE_PREFERENCE_KEY
    );
    if (!storedValue) return null;

    const parsedValue: unknown = JSON.parse(storedValue);
    return isAppOpenMode(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

export function getAppsLauncherPreferenceCookieOptions(source?: string | URL) {
  return getTuturuuuSharedCookieOptions(
    {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax' as const,
    },
    source
  );
}

const cookieListeners = new Set<() => void>();

/**
 * Writes a launcher preference to the shared cross-subdomain cookie and
 * notifies subscribers of {@link useAppsLauncherCookie}.
 */
export function writeAppsLauncherCookie(name: string, value: string) {
  setCookie(
    name,
    value,
    getAppsLauncherPreferenceCookieOptions(window.location.href)
  );
  for (const listener of cookieListeners) listener();
}

function subscribeToCookies(listener: () => void) {
  cookieListeners.add(listener);
  return () => {
    cookieListeners.delete(listener);
  };
}

/** Raw value of a launcher preference cookie; `null` on the server. */
export function useAppsLauncherCookie(name: string) {
  return useSyncExternalStore(
    subscribeToCookies,
    () => readAppsLauncherCookie(name),
    () => null
  );
}

function persistPreference(mode: AppOpenMode) {
  writeAppsLauncherCookie(APP_OPEN_MODE_PREFERENCE_KEY, mode);
}

export function useAppsLauncherOpenMode() {
  const [openMode, setOpenModeState] = useState<AppOpenMode>('new-tab');

  useEffect(() => {
    const cookiePreference = readAppsLauncherCookie(
      APP_OPEN_MODE_PREFERENCE_KEY
    );
    if (isAppOpenMode(cookiePreference)) {
      setOpenModeState(cookiePreference);
      return;
    }

    const legacyPreference = readLegacyPreference();
    if (!legacyPreference) return;

    setOpenModeState(legacyPreference);
    persistPreference(legacyPreference);
    window.localStorage.removeItem(APP_OPEN_MODE_PREFERENCE_KEY);
  }, []);

  const setOpenMode = useCallback((mode: AppOpenMode) => {
    setOpenModeState(mode);
    persistPreference(mode);
  }, []);

  return [openMode, setOpenMode] as const;
}
