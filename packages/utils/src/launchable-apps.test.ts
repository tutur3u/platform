import { describe, expect, it } from 'vitest';
import {
  getLaunchableApp,
  getLaunchableAppByTitle,
  getLaunchableAppOrigin,
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
    expect(getLaunchableAppByTitle('Tuturuuu')?.slug).toBe('platform');
    expect(getLaunchableAppByTitle('apps gateway')?.slug).toBe('apps');
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
  });

  it('detects Portless dev from the current origin', () => {
    const app = getLaunchableApp('tasks');

    expect(app).not.toBeNull();
    expect(
      getLaunchableAppOrigin(app!, {
        currentOrigin: 'https://calendar.tuturuuu.localhost',
      })
    ).toBe('https://tasks.tuturuuu.localhost');
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
