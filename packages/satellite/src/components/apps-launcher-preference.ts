'use client';

import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import { setCookie } from 'cookies-next';
import { useCallback, useEffect, useState } from 'react';
import type { AppOpenMode } from './apps-launcher-catalog';

export const APP_OPEN_MODE_PREFERENCE_KEY = 'tuturuuu-apps-launcher-open-mode';

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function isAppOpenMode(value: unknown): value is AppOpenMode {
  return value === 'current-tab' || value === 'new-tab';
}

function readCookie(name: string) {
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

function persistPreference(mode: AppOpenMode) {
  setCookie(
    APP_OPEN_MODE_PREFERENCE_KEY,
    mode,
    getAppsLauncherPreferenceCookieOptions(window.location.href)
  );
}

export function useAppsLauncherOpenMode() {
  const [openMode, setOpenModeState] = useState<AppOpenMode>('new-tab');

  useEffect(() => {
    const cookiePreference = readCookie(APP_OPEN_MODE_PREFERENCE_KEY);
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
