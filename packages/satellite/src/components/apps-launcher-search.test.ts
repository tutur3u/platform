import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { describe, expect, it } from 'vitest';
import { getCurrentLaunchableAppSlug } from './apps-launcher-current';
import { searchAppsLauncher } from './apps-launcher-search';

const copy = (app: LaunchableApp) => ({
  description: `${app.title} description`,
  title: app.title,
});

function slugs(query: string) {
  return searchAppsLauncher(LAUNCHABLE_APPS, query, copy).map(
    ({ app }) => app.slug
  );
}

describe('searchAppsLauncher', () => {
  it('ranks name prefixes before word starts, aliases and substrings', () => {
    expect(slugs('ta')[0]).toBe('tasks');
    expect(slugs('lettin')[0]).toBe('lettin');
    expect(slugs('money')).toEqual(['finance']);
  });

  it('returns highlight ranges inside the displayed title', () => {
    const [prefix] = searchAppsLauncher(LAUNCHABLE_APPS, 'cal', copy);
    expect(prefix?.app.slug).toBe('calendar');
    expect(prefix?.highlight).toEqual([[0, 3]]);

    const fuzzy = searchAppsLauncher(LAUNCHABLE_APPS, 'cldr', copy).find(
      ({ app }) => app.slug === 'calendar'
    );
    expect(fuzzy?.highlight).toEqual([
      [0, 1],
      [2, 3],
      [5, 6],
      [7, 8],
    ]);
  });

  it('keeps every app in catalog order for an empty query', () => {
    expect(slugs('  ')).toEqual(LAUNCHABLE_APPS.map((app) => app.slug));
  });
});

describe('getCurrentLaunchableAppSlug', () => {
  it('matches the app serving the page origin', () => {
    expect(getCurrentLaunchableAppSlug('http://localhost:7803/personal')).toBe(
      'platform'
    );
    expect(getCurrentLaunchableAppSlug('http://localhost:7808/personal')).toBe(
      'finance'
    );
    expect(
      getCurrentLaunchableAppSlug('https://tasks.tuturuuu.com/personal')
    ).toBe('tasks');
    expect(getCurrentLaunchableAppSlug('https://example.com/')).toBeUndefined();
    expect(getCurrentLaunchableAppSlug(undefined)).toBeUndefined();
  });
});
