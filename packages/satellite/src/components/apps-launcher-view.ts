import type {
  LaunchableApp,
  LaunchableAppCategory,
} from '@tuturuuu/utils/launchable-apps';
import {
  getLaunchableApp,
  LAUNCHABLE_APP_CATEGORIES,
} from '@tuturuuu/utils/launchable-apps';
import { APPS_LAUNCHER_RECENT_LIMIT } from './apps-launcher-favorites';
import {
  type AppsLauncherHighlight,
  searchAppsLauncher,
} from './apps-launcher-search';

export type AppsLauncherSectionId =
  | 'favorites'
  | 'recent'
  | 'results'
  | `category-${LaunchableAppCategory}`;

export type AppsLauncherEntry = {
  app: LaunchableApp;
  highlight: readonly AppsLauncherHighlight[];
  /** DOM id of the option, unique across sections. */
  id: string;
};

export type AppsLauncherSection = {
  category?: LaunchableAppCategory;
  entries: AppsLauncherEntry[];
  id: AppsLauncherSectionId;
  kind: 'chips' | 'rows';
};

export type AppsLauncherView = {
  /** Every visible option in visual order, as one keyboard list. */
  entries: AppsLauncherEntry[];
  sections: AppsLauncherSection[];
};

function toEntry(
  sectionId: AppsLauncherSectionId,
  app: LaunchableApp,
  highlight: readonly AppsLauncherHighlight[] = []
): AppsLauncherEntry {
  return { app, highlight, id: `apps-launcher-${sectionId}-${app.slug}` };
}

function slugsToApps(slugs: readonly string[]) {
  const apps: LaunchableApp[] = [];
  for (const slug of slugs) {
    const app = getLaunchableApp(slug);
    if (app) apps.push(app);
  }
  return apps;
}

/**
 * Builds the launcher sections. An empty query shows Recent chips,
 * Favorites rows and every app grouped by category; a query shows one
 * ranked Results list.
 */
export function buildAppsLauncherView({
  apps,
  favorites,
  getCopy,
  query,
  recent,
}: {
  apps: readonly LaunchableApp[];
  favorites: readonly string[];
  getCopy: (app: LaunchableApp) => { description: string; title: string };
  query: string;
  recent: readonly string[];
}): AppsLauncherView {
  const sections: AppsLauncherSection[] = [];

  if (query.trim()) {
    const matches = searchAppsLauncher(apps, query, getCopy);
    if (matches.length > 0) {
      sections.push({
        entries: matches.map(({ app, highlight }) =>
          toEntry('results', app, highlight)
        ),
        id: 'results',
        kind: 'rows',
      });
    }
  } else {
    const recentApps = slugsToApps(recent).slice(0, APPS_LAUNCHER_RECENT_LIMIT);
    if (recentApps.length > 0) {
      sections.push({
        entries: recentApps.map((app) => toEntry('recent', app)),
        id: 'recent',
        kind: 'chips',
      });
    }

    const favoriteApps = slugsToApps(favorites);
    if (favoriteApps.length > 0) {
      sections.push({
        entries: favoriteApps.map((app) => toEntry('favorites', app)),
        id: 'favorites',
        kind: 'rows',
      });
    }

    for (const category of LAUNCHABLE_APP_CATEGORIES) {
      const categoryApps = apps.filter((app) => app.category === category);
      if (categoryApps.length === 0) continue;
      const id = `category-${category}` as const;
      sections.push({
        category,
        entries: categoryApps.map((app) => toEntry(id, app)),
        id,
        kind: 'rows',
      });
    }
  }

  return {
    entries: sections.flatMap((section) => section.entries),
    sections,
  };
}

/**
 * The option highlighted before any keyboard or pointer movement: the first
 * result for a query, otherwise the first app that is not the current one,
 * so Enter switches away like Alt+Tab.
 */
export function getDefaultAppsLauncherEntry(
  view: AppsLauncherView,
  { currentSlug, query }: { currentSlug?: string; query: string }
) {
  if (query.trim()) return view.entries[0];
  return (
    view.entries.find((entry) => entry.app.slug !== currentSlug) ??
    view.entries[0]
  );
}
