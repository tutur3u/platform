import { createInternalApiClient } from '@tuturuuu/internal-api/client';
import { createWorkspaceTaskList } from '@tuturuuu/internal-api/tasks';
import { updateCurrentUserTaskSchedulingSettings } from '@tuturuuu/internal-api/tasks-scheduling';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCalendarBrowserApiPaths } from './calendar-api-client';
import { calendarApiPath } from './calendar-api-path';

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
      '/api/v1/workspaces/ws/calendars',
      '/api/v1/calendar/connections',
      '/api/v1/calendar/auth/accounts',
      '/api/v1/workspaces/ws/tasks/task',
      '/api/v1/workspaces/ws/settings/permissions',
      '/api/v1/users/me/profile',
    ])
      await client.json(path);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/calendar/api/v1/workspaces/ws/calendar/events',
      '/calendar/api/v1/workspaces/ws/calendars',
      '/calendar/api/v1/calendar/connections',
      '/calendar/api/v1/calendar/auth/accounts',
      '/calendar/api/v1/workspaces/ws/tasks/task',
      '/api/v1/workspaces/ws/settings/permissions',
      '/api/v1/users/me/profile',
    ]);
  });
  it('keeps mounted Tasks writes on Calendar so the session cookie is sent', async () => {
    vi.stubGlobal('__tuturuuuAppBase', '/calendar');
    vi.stubGlobal('window', {
      location: { hostname: 'tuturuuu.com', origin: 'https://tuturuuu.com' },
    });
    vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', 'https://tasks.tuturuuu.com');
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    unregister = registerCalendarBrowserApiPaths();

    await updateCurrentUserTaskSchedulingSettings('task-1', {
      total_duration: 1,
    });
    await createWorkspaceTaskList('ws', 'board-1', { name: 'List' });

    expect(
      fetch.mock.calls.map(([path, init]) => [path, init?.method])
    ).toEqual([
      ['/calendar/api/v1/users/me/tasks/task-1/schedule', 'PATCH'],
      ['/calendar/api/v1/workspaces/ws/task-boards/board-1/lists', 'POST'],
    ]);
    vi.unstubAllEnvs();
  });

  it.each(['', '/calendar'])('resolves only owned paths at base %j', (base) => {
    vi.stubGlobal('__tuturuuuAppBase', base);
    expect(
      calendarApiPath(
        '/api/v1/workspaces/ws/calendar/invitation-capabilities?provider=microsoft&connectionId=selected'
      )
    ).toBe(
      `${base}/api/v1/workspaces/ws/calendar/invitation-capabilities?provider=microsoft&connectionId=selected`
    );
    expect(
      calendarApiPath('/api/v1/workspaces/ws/calendar/events/event/attendees')
    ).toBe(`${base}/api/v1/workspaces/ws/calendar/events/event/attendees`);
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
});
