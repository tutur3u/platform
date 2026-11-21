import {
  createWorkspaceCalendarCategory,
  getWorkspaceCalendarSyncStatus,
  listCalendarAccounts,
  listProviderCalendars,
  listWorkspaceCalendarCategories,
} from '@tuturuuu/internal-api/calendar';
import { internalApiClient } from '@tuturuuu/internal-api/client';
import {
  getWorkspaceCalendarHours,
  updateWorkspaceCalendarHours,
} from '@tuturuuu/internal-api/settings';
import { createBasePath } from '@tuturuuu/start-bridge/base-path';
import { dispatchEndpoint } from '@tuturuuu/start-bridge/endpoints';
import { afterEach, expect, it, vi } from 'vitest';
import { registerCalendarBrowserApiPaths } from './calendar-api-client';
import { calendarEndpoints } from './api-registry.server';

afterEach(() => vi.unstubAllGlobals());

it.each(['', '/calendar'])(
  'routes shared Calendar clients through the %j mount',
  async (basePath) => {
    vi.stubGlobal('__tuturuuuAppBase', basePath);
    vi.stubGlobal('window', { location: { origin: 'https://tuturuuu.com' } });
    const mount = createBasePath({ app: 'calendar', basePath });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(
        new URL(String(input), 'https://tuturuuu.com'),
        init
      );
      const pathname = mount.strip(new URL(request.url).pathname);
      if (!pathname) return new Response(null, { status: 404 });
      const routes = await dispatchEndpoint(
        calendarEndpoints,
        new Request(request.url, { method: 'OPTIONS' }),
        { pathname }
      );
      return routes?.headers.get('allow')?.split(', ').includes(request.method)
        ? Response.json({})
        : new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetch);
    const unregister = registerCalendarBrowserApiPaths();
    try {
      const workspace = '/api/v1/workspaces/ws';
      await getWorkspaceCalendarHours('ws');
      await updateWorkspaceCalendarHours('ws', { type: 'WORK', hours: {} });
      await listWorkspaceCalendarCategories('ws');
      await createWorkspaceCalendarCategory('ws', { name: 'Work' });
      await getWorkspaceCalendarSyncStatus('ws');
      await listCalendarAccounts('ws');
      await listProviderCalendars('ws');
      expect(fetch.mock.calls.map(([path]) => path)).toEqual([
        `${basePath}${workspace}/calendar-hours`,
        `${basePath}${workspace}/calendar-hours`,
        `${basePath}${workspace}/calendar/categories`,
        `${basePath}${workspace}/calendar/categories`,
        `${basePath}${workspace}/calendar/sync-status`,
        `${basePath}/api/v1/calendar/auth/accounts?wsId=ws`,
        `${basePath}/api/v1/calendar/auth/provider-calendars?wsId=ws`,
      ]);
      await internalApiClient.fetch('/api/v1/users/me/profile');
      expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/v1/users/me/profile');
    } finally {
      unregister();
    }
  }
);
