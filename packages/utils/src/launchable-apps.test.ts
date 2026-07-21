import { describe, expect, it } from 'vitest';
import {
  getLaunchableApp,
  getLaunchableAppByTitle,
  getLaunchableAppOrigin,
  LAUNCHABLE_APP_CATEGORIES,
  LAUNCHABLE_APPS,
  type LaunchableWorkspace,
  resolveLaunchableAppPath,
  resolveLaunchableAppUrl,
} from './launchable-apps';

const personalWorkspace: LaunchableWorkspace = {
  id: 'workspace-id',
  name: 'Personal',
  personal: true,
};

const teamWorkspace: LaunchableWorkspace = {
  id: 'team-workspace',
  name: 'Team Workspace',
  personal: false,
};

describe('launchable apps', () => {
  it('resolves apps by slug, title, and aliases', () => {
    expect(getLaunchableApp('calendar')?.title).toBe('Calendar');
    expect(getLaunchableApp('forms')).toMatchObject({
      appRoot: 'apps/forms',
      productionUrl: 'https://forms.tuturuuu.com',
      title: 'Forms',
    });
    expect(getLaunchableAppByTitle('Tuturuuu')?.slug).toBe('platform');
    expect(getLaunchableAppByTitle('questionnaires')?.slug).toBe('forms');
    expect(getLaunchableAppByTitle('apps gateway')?.slug).toBe('apps');
  });

  it('keeps retired apps out of the catalog and pins category overrides', () => {
    expect(LAUNCHABLE_APPS.map((app) => app.slug)).not.toContain('external');
    expect(LAUNCHABLE_APPS.map((app) => app.slug)).not.toContain('playground');
    expect(LAUNCHABLE_APP_CATEGORIES).not.toContain('core');
    expect(LAUNCHABLE_APP_CATEGORIES).not.toContain('content');
    expect(LAUNCHABLE_APP_CATEGORIES).not.toContain('developer');
    expect(LAUNCHABLE_APP_CATEGORIES).toContain('miscellaneous');
    expect(getLaunchableApp('external')).toBeNull();
    expect(getLaunchableApp('playground')).toBeNull();
    expect(getLaunchableApp('platform')?.category).toBe('productivity');
    expect(getLaunchableApp('apps')?.category).toBe('miscellaneous');
    expect(getLaunchableApp('cms')?.category).toBe('operations');
    expect(getLaunchableApp('rewise')?.category).toBe('ai');
    expect(getLaunchableApp('docs')?.category).toBe('miscellaneous');
    expect(getLaunchableApp('tools')?.category).toBe('miscellaneous');
    expect(getLaunchableApp('shortener')?.category).toBe('miscellaneous');
    expect(
      LAUNCHABLE_APPS.filter((app) => app.category === 'productivity').map(
        (app) => app.slug
      )[0]
    ).toBe('platform');
    expect(
      LAUNCHABLE_APPS.filter((app) => app.category === 'operations').map(
        (app) => app.slug
      )
    ).not.toContain('apps');
    expect(
      LAUNCHABLE_APPS.filter((app) => app.category === 'miscellaneous').map(
        (app) => app.slug
      )[0]
    ).toBe('apps');
  });

  it('resolves production, Portless, and local origins', () => {
    const app = getLaunchableApp('calendar');

    expect(app).not.toBeNull();
    expect(getLaunchableAppOrigin(app!, { environment: 'production' })).toBe(
      'https://calendar.tuturuuu.com'
    );
    expect(getLaunchableAppOrigin(app!, { environment: 'portless' })).toBe(
      'https://calendar.tuturuuu.localhost'
    );
    expect(getLaunchableAppOrigin(app!, { environment: 'localhost' })).toBe(
      'http://localhost:7806'
    );

    const meet = getLaunchableApp('meet');
    expect(meet).not.toBeNull();
    expect(getLaunchableAppOrigin(meet!, { environment: 'production' })).toBe(
      'https://meet.tuturuuu.com'
    );

    const docs = getLaunchableApp('docs');
    expect(docs).not.toBeNull();
    expect(getLaunchableAppOrigin(docs!, { environment: 'production' })).toBe(
      'https://docs.tuturuuu.com'
    );
    expect(getLaunchableAppOrigin(docs!, { environment: 'portless' })).toBe(
      'https://docs.tuturuuu.localhost'
    );
  });

  it('detects Portless dev from the current origin', () => {
    const app = getLaunchableApp('tasks');

    expect(app).not.toBeNull();
    expect(
      getLaunchableAppOrigin(app!, {
        currentOrigin: 'https://calendar.tuturuuu.localhost',
      })
    ).toBe('https://tasks.tuturuuu.localhost');

    expect(
      getLaunchableAppOrigin(app!, {
        currentOrigin: 'https://tuturuuu.localhost:1355',
      })
    ).toBe('https://tasks.tuturuuu.localhost:1355');
  });

  it('preserves the Portless proxy port in full app URLs', () => {
    const app = getLaunchableApp('tasks');

    expect(app).not.toBeNull();
    expect(
      resolveLaunchableAppUrl({
        app: app!,
        currentOrigin: 'https://tuturuuu.localhost:1355',
        searchParams: { source: 'sidebar-apps' },
        workspace: teamWorkspace,
      })
    ).toBe(
      'https://tasks.tuturuuu.localhost:1355/team-workspace/tasks?source=sidebar-apps'
    );
  });

  it('uses default paths when no workspace is provided', () => {
    const app = getLaunchableApp('learn');

    expect(app).not.toBeNull();
    expect(resolveLaunchableAppPath({ app: app! })).toBe('/dashboard');
  });

  it('uses workspace-aware paths and personal slugs', () => {
    const platform = getLaunchableApp('platform');
    const tasks = getLaunchableApp('tasks');
    const meet = getLaunchableApp('meet');

    expect(platform).not.toBeNull();
    expect(tasks).not.toBeNull();
    expect(meet).not.toBeNull();
    expect(
      resolveLaunchableAppPath({
        app: platform!,
        workspace: personalWorkspace,
      })
    ).toBe('/personal');
    expect(
      resolveLaunchableAppPath({
        app: tasks!,
        workspace: teamWorkspace,
      })
    ).toBe('/team-workspace/tasks');
    expect(
      resolveLaunchableAppPath({
        app: meet!,
        workspace: teamWorkspace,
      })
    ).toBe('/workspace/team-workspace');
  });

  it('lets callers override workspace path resolution', () => {
    const app = getLaunchableApp('calendar');

    expect(app).not.toBeNull();
    expect(
      resolveLaunchableAppPath({
        app: app!,
        workspace: teamWorkspace,
        workspacePathResolver: (workspace) => `/custom/${workspace.id}`,
      })
    ).toBe('/custom/team-workspace');
  });

  it('resolves full URLs with paths and search params', () => {
    const app = getLaunchableApp('finance');

    expect(app).not.toBeNull();
    expect(
      resolveLaunchableAppUrl({
        app: app!,
        environment: 'production',
        searchParams: {
          source: 'command',
          tag: ['a', 'b'],
        },
        workspace: personalWorkspace,
      })
    ).toBe('https://finance.tuturuuu.com/personal?source=command&tag=a&tag=b');
  });
});
