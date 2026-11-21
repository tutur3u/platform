import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));

import { DOWNLOAD_APP_FAMILIES, resolveAppFamilies } from './app-families';

describe('download app families', () => {
  it('resolves every listed app from the launchable app registry', () => {
    const apps = resolveAppFamilies();
    expect(apps.map((app) => app.slug)).toEqual(
      DOWNLOAD_APP_FAMILIES.map(([slug]) => slug)
    );
    for (const app of apps) {
      expect(app.title).toBeTruthy();
      expect(new URL(app.href).protocol).toBe('https:');
    }
  });

  it('includes the apps shipped in the Tuturuuu builds', () => {
    expect(resolveAppFamilies().map((app) => app.slug)).toEqual(
      expect.arrayContaining(['meet', 'mail', 'calendar', 'tasks'])
    );
  });
});
