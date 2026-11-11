import { createInternalApiClient } from '@tuturuuu/internal-api/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCalendarBrowserApiPaths } from './calendar-api-client';
import { calendarApiPath, calendarFetch } from './calendar-api-path';

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
  vi.unstubAllGlobals();
});
describe('Calendar client API ownership', () => {
  it('routes local and Tasks APIs through Calendar while keeping Web APIs at root', async () => {
    vi.stubGlobal('__tuturuuuAppBase', '/calendar');
    vi.stubGlobal('window', {
      location: { hostname: 'tuturuuu.com', origin: 'https://tuturuuu.com' },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    unregister = registerCalendarBrowserApiPaths();
    const client = createInternalApiClient();
    for (const path of [
      '/api/v1/workspaces/ws/calendar/events',
      '/api/v1/workspaces/ws/tasks/task',
      '/api/v1/workspaces/ws/settings/permissions',
      '/api/v1/users/me/profile',
    ])
      await client.json(path);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/calendar/api/v1/workspaces/ws/calendar/events',
      '/calendar/api/v1/workspaces/ws/tasks/task',
      '/api/v1/workspaces/ws/settings/permissions',
      '/api/v1/users/me/profile',
    ]);
  });
  it.each(['', '/calendar'])('resolves only owned paths at base %j', (base) => {
    vi.stubGlobal('__tuturuuuAppBase', base);
    expect(calendarApiPath('/api/v1/calendar/connections?x=a%2Bb')).toBe(
      `${base}/api/v1/calendar/connections?x=a%2Bb`
    );
    expect(calendarApiPath('/api/v1/workspaces/ws/tasksmith')).toBe(
      '/api/v1/workspaces/ws/tasksmith'
    );
    expect(calendarApiPath('https://provider.test/file')).toBe(
      'https://provider.test/file'
    );
  });
  it.each([
    ['', ''],
    ['/calendar', '/calendar'],
  ])(
    'prefixes raw browser calls to Calendar-owned settings routes at base %j',
    async (base, prefix) => {
      vi.stubGlobal('__tuturuuuAppBase', base);
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({})
      );
      vi.stubGlobal('fetch', fetch);
      for (const path of [
        '/api/v1/workspaces/ws/calendar-settings',
        '/api/v1/users/calendar-settings',
        '/api/v1/workspaces/ws/calendar/categories',
        '/api/v1/workspaces/ws/calendar/schedule/preview',
        '/api/v1/workspaces/ws/calendar-hours',
      ])
        await calendarFetch(path, { method: 'PATCH' });
      expect(fetch.mock.calls.map(([path]) => path)).toEqual([
        `${prefix}/api/v1/workspaces/ws/calendar-settings`,
        `${prefix}/api/v1/users/calendar-settings`,
        `${prefix}/api/v1/workspaces/ws/calendar/categories`,
        `${prefix}/api/v1/workspaces/ws/calendar/schedule/preview`,
        `${prefix}/api/v1/workspaces/ws/calendar-hours`,
      ]);
      expect(fetch.mock.calls[0]?.[1]).toEqual({ method: 'PATCH' });
    }
  );
  it('leaves Web-owned and non-string inputs untouched under a mount', async () => {
    vi.stubGlobal('__tuturuuuAppBase', '/calendar');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    const url = new URL('https://provider.test/file');
    await calendarFetch('/api/v1/users/me/profile');
    await calendarFetch(url);
    expect(fetch.mock.calls.map(([input]) => input)).toEqual([
      '/api/v1/users/me/profile',
      url,
    ]);
  });
});
