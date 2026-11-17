'use client';

import { getLaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { useMemo } from 'react';
import {
  readAppsLauncherCookie,
  useAppsLauncherCookie,
  writeAppsLauncherCookie,
} from './apps-launcher-preference';

export const APP_FAVORITES_PREFERENCE_KEY = 'tuturuuu-apps-launcher-favorites';
export const APP_RECENT_PREFERENCE_KEY = 'tuturuuu-apps-launcher-recent';
export const APPS_LAUNCHER_RECENT_LIMIT = 5;

/** Parses a comma-separated slug cookie, keeping known apps once each. */
export function parseAppsLauncherSlugs(value: string | null | undefined) {
  if (!value) return [];
  const slugs: string[] = [];
  for (const entry of value.split(',')) {
    const slug = entry.trim();
    if (slug && !slugs.includes(slug) && getLaunchableApp(slug)) {
      slugs.push(slug);
    }
  }
  return slugs;
}

function useSlugList(name: string) {
  const raw = useAppsLauncherCookie(name);
  return useMemo(() => parseAppsLauncherSlugs(raw), [raw]);
}

function readSlugList(name: string) {
  return parseAppsLauncherSlugs(readAppsLauncherCookie(name));
}

/** Favorite app slugs in the order they were starred. */
export function useAppsLauncherFavorites() {
  const favorites = useSlugList(APP_FAVORITES_PREFERENCE_KEY);

  function toggleFavorite(slug: string) {
    const current = readSlugList(APP_FAVORITES_PREFERENCE_KEY);
    const next = current.includes(slug)
      ? current.filter((entry) => entry !== slug)
      : [...current, slug];
    writeAppsLauncherCookie(APP_FAVORITES_PREFERENCE_KEY, next.join(','));
  }

  return { favorites, toggleFavorite };
}

/** Recently opened app slugs, most recent first. */
export function useAppsLauncherRecent() {
  const recent = useSlugList(APP_RECENT_PREFERENCE_KEY);

  function recordRecent(slug: string) {
    const next = [
      slug,
      ...readSlugList(APP_RECENT_PREFERENCE_KEY).filter(
        (entry) => entry !== slug
      ),
    ].slice(0, APPS_LAUNCHER_RECENT_LIMIT);
    writeAppsLauncherCookie(APP_RECENT_PREFERENCE_KEY, next.join(','));
  }

  return { recent, recordRecent };
}
