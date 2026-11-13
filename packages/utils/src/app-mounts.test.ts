import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAppBasePath,
  getAppProductionBaseUrl,
  isAppMounted,
  joinAppUrl,
  ONE_ORIGIN_APP_BASE_PATHS,
  parseActiveAppMounts,
  resolveMountedAppFromUrl,
} from './app-mounts';
import { getLaunchableApp, resolveLaunchableAppUrl } from './launchable-apps';

const NONE = new Set<string>();
const mounts = (...apps: string[]) => new Set(apps);

afterEach(() => vi.unstubAllEnvs());

describe('app mount registry', () => {
  it('maps storefront to /store and other apps to /<app>', () => {
    expect(getAppBasePath('storefront')).toBe('/store');
    expect(getAppBasePath('tasks')).toBe('/tasks');
    expect(getAppBasePath('platform')).toBeNull();
    expect(getAppBasePath('constructor')).toBeNull();
  });

  it('uses single-segment base paths without a trailing slash', () => {
    for (const basePath of Object.values(ONE_ORIGIN_APP_BASE_PATHS)) {
      expect(basePath).toMatch(/^\/[a-z]+$/u);
    }
  });

  it('is off by default: subdomain URLs are unchanged', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    expect(parseActiveAppMounts().size).toBe(0);
    expect(isAppMounted('tasks')).toBe(false);
    expect(getAppProductionBaseUrl('tasks', 'https://tasks.tuturuuu.com')).toBe(
      'https://tasks.tuturuuu.com'
    );
    expect(
      getAppProductionBaseUrl('tasks', 'https://tasks.tuturuuu.com/', NONE)
    ).toBe('https://tasks.tuturuuu.com');
  });

  it('serves an active mount at https://tuturuuu.com/<base> with no slash', () => {
    expect(
      getAppProductionBaseUrl(
        'tasks',
        'https://tasks.tuturuuu.com',
        mounts('tasks')
      )
    ).toBe('https://tuturuuu.com/tasks');
    expect(
      getAppProductionBaseUrl(
        'storefront',
        'https://storefront.tuturuuu.com',
        mounts('storefront')
      )
    ).toBe('https://tuturuuu.com/store');
  });

  it('reads active mounts from the env, case-insensitively', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', ' Learn , tasks ,');
    expect(isAppMounted('learn')).toBe(true);
    expect(isAppMounted('tasks')).toBe(true);
    expect(isAppMounted('calendar')).toBe(false);
  });

  it('ignores unknown apps in the active list', () => {
    expect(isAppMounted('platform', mounts('platform'))).toBe(false);
    expect(
      getAppProductionBaseUrl(
        'docs',
        'https://docs.tuturuuu.com',
        mounts('docs')
      )
    ).toBe('https://docs.tuturuuu.com');
  });

  it('joins paths without ever adding a trailing slash', () => {
    const base = 'https://tuturuuu.com/tasks';
    expect(joinAppUrl(base)).toBe('https://tuturuuu.com/tasks');
    expect(joinAppUrl(`${base}/`, '/')).toBe('https://tuturuuu.com/tasks');
    expect(joinAppUrl(base, '/personal/')).toBe(
      'https://tuturuuu.com/tasks/personal'
    );
    expect(joinAppUrl(base, 'personal?x=1#top')).toBe(
      'https://tuturuuu.com/tasks/personal?x=1#top'
    );
    expect(joinAppUrl(base, '/?x=1')).toBe('https://tuturuuu.com/tasks?x=1');
  });

  it('resolves shared-origin URLs by longest prefix on segment boundaries', () => {
    const active = mounts('tasks', 'meet', 'storefront');
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/tasks', active)
    ).toEqual({ app: 'tasks', basePath: '/tasks', appPath: '/' });
    expect(
      resolveMountedAppFromUrl(
        'https://tuturuuu.com/tasks/personal?x=1',
        active
      )
    ).toEqual({ app: 'tasks', basePath: '/tasks', appPath: '/personal' });
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/store/acme', active)
    ).toEqual({ app: 'storefront', basePath: '/store', appPath: '/acme' });
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/tasks-team', active)
    ).toBeNull();
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/meet-together', active)
    ).toBeNull();
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/personal', active)
    ).toBeNull();
  });

  it('never resolves other origins or inactive mounts', () => {
    const active = mounts('tasks');
    expect(
      resolveMountedAppFromUrl('https://tasks.tuturuuu.com/tasks', active)
    ).toBeNull();
    expect(
      resolveMountedAppFromUrl('http://tuturuuu.com/tasks', active)
    ).toBeNull();
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com.evil.test/tasks', active)
    ).toBeNull();
    expect(
      resolveMountedAppFromUrl('https://tuturuuu.com/calendar', active)
    ).toBeNull();
    expect(resolveMountedAppFromUrl('not a url', active)).toBeNull();
  });
});

describe('launchable apps with mounts', () => {
  it('keeps production subdomain URLs while no mount is active', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
    const tasks = getLaunchableApp('tasks')!;
    expect(
      resolveLaunchableAppUrl({
        app: tasks,
        environment: 'production',
        path: '/',
      })
    ).toBe('https://tasks.tuturuuu.com/');
  });

  it('launches an active mount under https://tuturuuu.com/<base>', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks');
    const tasks = getLaunchableApp('tasks')!;
    expect(
      resolveLaunchableAppUrl({
        app: tasks,
        environment: 'production',
        path: '/',
      })
    ).toBe('https://tuturuuu.com/tasks');
    expect(
      resolveLaunchableAppUrl({
        app: tasks,
        environment: 'production',
        path: '/personal',
        searchParams: { view: 'board' },
      })
    ).toBe('https://tuturuuu.com/tasks/personal?view=board');
  });

  it('never applies mounts outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks');
    const tasks = getLaunchableApp('tasks')!;
    expect(
      resolveLaunchableAppUrl({
        app: tasks,
        environment: 'localhost',
        path: '/',
      })
    ).not.toContain('tuturuuu.com/tasks');
  });
});
