import { describe, expect, it } from 'vitest';
import { resolveSatelliteDockLocation } from './satellite-mobile-dock-location';

describe('resolveSatelliteDockLocation', () => {
  it('keeps Apps active in apps without their own slot below their root', () => {
    expect(
      resolveSatelliteDockLocation('/personal', 'personal', 'finance')
    ).toEqual({
      active: 'apps',
      base: '/personal',
      rootPath: '/personal',
      atRoot: true,
      workspace: 'personal',
    });
    expect(
      resolveSatelliteDockLocation(
        '/vi/personal/budgets/2026',
        'personal',
        'finance'
      )
    ).toMatchObject({
      active: 'apps',
      base: '/vi/personal',
      rootPath: '/vi/personal',
      atRoot: false,
    });
  });

  it('marks Tasks and Calendar in their own apps', () => {
    expect(
      resolveSatelliteDockLocation('/personal/tasks', 'personal', 'tasks')
    ).toMatchObject({
      active: 'tasks',
      rootPath: '/personal/tasks',
      atRoot: true,
    });
    expect(
      resolveSatelliteDockLocation(
        '/personal/tasks/boards/b1',
        'personal',
        'tasks'
      )
    ).toMatchObject({ active: 'tasks', atRoot: false });
    expect(
      resolveSatelliteDockLocation('/en/ws-1', 'ws-1', 'calendar')
    ).toMatchObject({ active: 'calendar', rootPath: '/en/ws-1', atRoot: true });
  });

  it('finds the workspace under a prefix such as Meet’s /workspace', () => {
    expect(
      resolveSatelliteDockLocation('/workspace/ws-1', 'ws-1', 'meet')
    ).toMatchObject({ base: '/workspace/ws-1', atRoot: true });
  });

  it('shows no dock outside a workspace route', () => {
    expect(
      resolveSatelliteDockLocation('/login', undefined, 'finance')
    ).toBeNull();
    expect(
      resolveSatelliteDockLocation('/login', 'ws-1', 'finance')
    ).toBeNull();
  });
});
