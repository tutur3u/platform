// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appApiPatterns } from '../runtime/api-patterns.bridge.gen';
import {
  createCalendarApiRewrites,
  isCalendarOwnedApiPath,
  resolveCalendarAppUrl,
} from './calendar-api-rewrites';

describe('calendar API ownership', () => {
  it.each(['calendar', 'calendar-hours', 'calendars'])(
    'routes the %s API family directly to Calendar',
    (family) => {
      const source = `/api/v1/workspaces/:wsId/${family}/:path*`;
      expect(
        createCalendarApiRewrites('https://calendar.example.com/')
      ).toContainEqual({
        source,
        destination: `https://calendar.example.com${source}`,
      });
    }
  );
  it('routes settings before the Web fallback', () => {
    expect(
      createCalendarApiRewrites('https://calendar.example.com')
    ).toContainEqual({
      source: '/api/v1/workspaces/:wsId/calendar-settings',
      destination:
        'https://calendar.example.com/api/v1/workspaces/:wsId/calendar-settings',
    });
  });
  it.each(['/api/v1/calendar', '/api/v1/workspaces/:wsId/calendars'])(
    'preserves the collection path %s before wildcard matching',
    (source) => {
      const rewrites = createCalendarApiRewrites('https://owner.example.com');
      const exact = rewrites.findIndex((route) => route.source === source);
      const nested = rewrites.findIndex(
        (route) => route.source === `${source}/:path*`
      );
      expect(exact).toBeGreaterThanOrEqual(0);
      expect(exact).toBeLessThan(nested);
      expect(rewrites[exact]?.destination).toBe(
        `https://owner.example.com${source}`
      );
    }
  );
  it('does not redirect host-local authentication or unrelated workspace APIs', () => {
    const rewrites = createCalendarApiRewrites('https://calendar.example.com');
    expect(rewrites.some((route) => route.source.startsWith('/api/auth'))).toBe(
      false
    );
    expect(rewrites.some((route) => route.source.includes('/wallets'))).toBe(
      false
    );
  });
});

describe('isCalendarOwnedApiPath', () => {
  // Segments are the catch-all `params.path`, i.e. the segments after `/api/`.
  it.each([
    [['v1', 'calendar']],
    [['v1', 'calendar', 'auth']],
    [['v1', 'calendar', 'auth', 'accounts']],
    [['v1', 'calendar', 'auth', 'microsoft', 'callback']],
    [['v1', 'calendar', 'auth', 'import-calendars']],
    [['v1', 'calendar', 'audio']],
    [['v1', 'mira', 'calendar']],
    [['v1', 'mira', 'calendar', 'insights']],
    [['ws-1', 'calendar', 'events']],
    [['v1', 'users', 'calendar-settings']],
    [['v1', 'workspaces', 'ws-1', 'calendar', 'habit-events']],
    [['v1', 'workspaces', 'ws-1', 'calendar', 'events']],
    [['v1', 'workspaces', 'ws-1', 'calendar-hours']],
    [['v1', 'workspaces', 'ws-1', 'calendars']],
    [['v1', 'workspaces', 'ws-1', 'calendar-settings']],
  ])('owns the Calendar contract path %j', (path) => {
    expect(isCalendarOwnedApiPath(path)).toBe(true);
  });

  it.each([
    [['v1', 'workspaces', 'ws-1', 'tasks']],
    [['v1', 'workspaces', 'ws-1', 'habits']],
    [['v1', 'workspaces', 'ws-1', 'habit-trackers']],
    [['v1', 'workspaces', 'ws-1', 'task-boards']],
    [['v1', 'workspaces', 'ws-1', 'time-tracking', 'tasks']],
    [['v1', 'workspaces', 'ws-1', 'settings', 'permissions']],
    // The rewrite contract mounts calendar-settings exactly, not its subtree.
    [['v1', 'workspaces', 'ws-1', 'calendar-settings', 'nested']],
    [['v1', 'users', 'calendar-settings', 'nested']],
    [['v1', 'users', 'me', 'tasks']],
    [['v1', 'users', 'task-settings']],
    [['v1', 'mira', 'tasks']],
    [['v1', 'task-projects', 'resolve-workspace']],
    [['admin', 'tasks', 'embeddings', 'stats']],
    [['cron', 'tasks', 'cleanup-media']],
    [['auth', 'logout']],
    [['webhooks', 'tasks', 'embedding']],
    [['workspaces', 'ws-1']],
    [['shared', 'task-boards', 'code']],
    [['v1', 'workspaces', 'invitations']],
  ])('keeps %j outside the Calendar contract', (path) => {
    expect(isCalendarOwnedApiPath(path)).toBe(false);
  });

  it('owns no empty path', () => {
    expect(isCalendarOwnedApiPath([])).toBe(false);
  });

  it('stays disjoint from the Tasks native endpoint registry', () => {
    // A calendar-owned path must reach the forwarding catch-all, so no explicit
    // Tasks endpoint pattern may itself be calendar-owned.
    for (const pattern of appApiPatterns) {
      // The catch-all itself forwards by ownership; exclude it.
      if (pattern.includes('[...')) continue;
      const segments = pattern
        .split('/')
        .filter(Boolean)
        .slice(1)
        .map((segment) => segment.replaceAll(/[[\]]/gu, ''));
      expect(isCalendarOwnedApiPath(segments)).toBe(false);
    }
  });
});

describe('createCalendarApiRewrites', () => {
  it('keeps the Next beforeFiles rewrite contract', () => {
    expect(
      createCalendarApiRewrites('https://calendar.example.invalid')
    ).toEqual(
      [
        '/api/v1/calendar/:path*',
        '/api/v1/mira/calendar/:path*',
        '/api/:wsId/calendar/:path*',
        '/api/v1/users/calendar-settings',
        '/api/v1/workspaces/:wsId/calendar/:path*',
        '/api/v1/workspaces/:wsId/calendar-hours/:path*',
        '/api/v1/workspaces/:wsId/calendar-settings',
        '/api/v1/workspaces/:wsId/calendars/:path*',
      ]
        .flatMap((source) =>
          source.endsWith('/:path*')
            ? [source.replace(/\/:path\*$/u, ''), source]
            : [source]
        )
        .map((source) => ({
          source,
          destination: `https://calendar.example.invalid${source}`,
        }))
    );
  });
});

describe('resolveCalendarAppUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers the explicit calendar origin', () => {
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.example.invalid/');
    expect(resolveCalendarAppUrl()).toBe('https://calendar.example.invalid');
  });

  it('falls back to the production calendar origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveCalendarAppUrl()).toBe('https://calendar.tuturuuu.com');
  });
});
