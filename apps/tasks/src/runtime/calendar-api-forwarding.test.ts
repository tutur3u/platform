// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../cloudflare/worker';

const suppliers = vi.hoisted(() => ({ workspace: vi.fn(), fetch: vi.fn() }));

// Keep Worker, bridge, registry and proxy routing real; isolate external services.
vi.mock(
  '@tuturuuu/satellite/workspace-settings-route-handlers',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/satellite/workspace-settings-route-handlers')
    >()),
    createSatelliteWorkspaceRouteHandlers: () => ({ GET: suppliers.workspace }),
  })
);
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: () => {
      throw new Error('Unexpected SSR');
    },
  }),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/api-proxy-guard')>()),
  guardApiProxyRequest: vi.fn().mockResolvedValue(null),
  hasAuthenticatedBearerToken: (headers: Headers) =>
    headers.get('authorization') === 'Bearer fictional-test-only',
}));

const CALENDAR_ORIGIN = 'https://calendar.example.invalid';
const WEB_ORIGIN = 'https://web.example.invalid';

const env = {
  INTERNAL_WEB_API_ORIGIN: WEB_ORIGIN,
  SUPABASE_SECRET_KEY: 'fictional-test-only',
  TUTURUUU_APP_COORDINATION_SECRET: 'fictional-test-only',
};
const ctx = { waitUntil: vi.fn() };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  // The catch-all resolves its forwarding targets per request.
  vi.stubEnv('TTR_URL', WEB_ORIGIN);
  vi.stubEnv('CALENDAR_APP_URL', CALENDAR_ORIGIN);
  vi.stubGlobal('fetch', suppliers.fetch);
  suppliers.workspace
    .mockReset()
    .mockResolvedValue(Response.json({ owner: 'tasks' }));
  suppliers.fetch
    .mockReset()
    .mockImplementation(() => Response.json({ owner: 'calendar' }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(path: string, mounted: boolean) {
  return new Request(
    `${mounted ? 'https://tuturuuu.com/tasks' : 'https://tasks.tuturuuu.com'}${path}`,
    {
      headers: { authorization: 'Bearer fictional-test-only' },
    }
  );
}

function forwardedUrl(): string {
  expect(suppliers.fetch).toHaveBeenCalledOnce();
  const [target] = suppliers.fetch.mock.calls[0]!;
  return target instanceof Request ? target.url : String(target);
}

describe.each([false, true])(
  'exported Tasks Worker calendar API routing (mounted=%s)',
  (mounted) => {
    it.each([
      '/api/v1/calendar/auth',
      '/api/v1/calendar/auth/accounts?wsId=ws-1',
      '/api/v1/calendar/auth/microsoft?wsId=ws-1',
      '/api/v1/calendar/auth/import-calendars',
      '/api/v1/mira/calendar',
      '/api/v1/users/calendar-settings',
      '/api/v1/workspaces/ws-1/calendar-settings',
      '/api/v1/workspaces/ws-1/calendars/reset',
    ])(
      'forwards the Calendar-owned path %s to the Calendar app, not Web',
      async (path) => {
        const response = await worker.fetch(request(path, mounted), env, ctx);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ owner: 'calendar' });
        expect(forwardedUrl()).toBe(`${CALENDAR_ORIGIN}${path}`);
        expect(suppliers.workspace).not.toHaveBeenCalled();
      }
    );

    it('forwards habit-events to the Calendar app with the query intact', async () => {
      const response = await worker.fetch(
        request(
          '/api/v1/workspaces/ws-1/calendar/habit-events?start_at=2026-11-01T00:00:00.000Z&end_at=2026-11-30T23:59:59.999Z',
          mounted
        ),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(forwardedUrl()).toBe(
        `${CALENDAR_ORIGIN}/api/v1/workspaces/ws-1/calendar/habit-events?start_at=2026-11-01T00:00:00.000Z&end_at=2026-11-30T23:59:59.999Z`
      );
    });

    it('keeps non-calendar unowned API paths on central Web', async () => {
      const response = await worker.fetch(
        request('/api/v1/users/notifications', mounted),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(forwardedUrl()).toBe(`${WEB_ORIGIN}/api/v1/users/notifications`);
    });

    it('keeps central-first Web reserved paths on central Web', async () => {
      const response = await worker.fetch(
        request(
          '/api/v1/workspaces/ws-1/settings/permissions?path=one',
          mounted
        ),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(forwardedUrl()).toBe(
        `${WEB_ORIGIN}/api/v1/workspaces/ws-1/settings/permissions?path=one`
      );
    });

    it('still serves Tasks-owned endpoints locally', async () => {
      const response = await worker.fetch(
        request('/api/workspaces/ws-1', mounted),
        env,
        ctx
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ owner: 'tasks' });
      expect(suppliers.workspace).toHaveBeenCalledOnce();
      expect(suppliers.fetch).not.toHaveBeenCalled();
    });

    it('still answers a local 404 for unmounted Tasks-owned paths', async () => {
      const response = await worker.fetch(
        request('/api/v1/shared/task-boards', mounted),
        env,
        ctx
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: 'Task API route is not mounted in the tasks app',
      });
      expect(suppliers.fetch).not.toHaveBeenCalled();
    });
  }
);

describe('exported Tasks Worker calendar forwarding semantics', () => {
  it('preserves method, body and the sanitized cookie on the Calendar hop', async () => {
    suppliers.fetch.mockImplementation(
      () =>
        new Response('{"owner":"calendar"}', {
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'tuturuuu_session=fixture; Path=/',
          },
        })
    );
    const response = await worker.fetch(
      new Request('https://tasks.tuturuuu.com/api/v1/calendar/auth/sync', {
        method: 'POST',
        headers: {
          authorization: 'Bearer fictional-test-only',
          'content-type': 'application/json',
          cookie:
            'tuturuuu_app_session=fixture-token; sb-test-auth-token=secret',
        },
        body: JSON.stringify({ calendarId: 'cal-1' }),
      }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    // The proxied session cookies are relayed; only Supabase auth cookies are
    // cleared, so the upstream session cookie must survive the hop.
    expect(response.headers.getSetCookie()).toContain(
      'tuturuuu_session=fixture; Path=/'
    );
    expect(
      response.headers
        .getSetCookie()
        .every(
          (cookie) =>
            cookie === 'tuturuuu_session=fixture; Path=/' ||
            cookie.startsWith('sb-')
        )
    ).toBe(true);

    expect(suppliers.fetch).toHaveBeenCalledOnce();
    const [target, init] = suppliers.fetch.mock.calls[0]!;
    expect(target instanceof Request ? target.url : String(target)).toBe(
      `${CALENDAR_ORIGIN}/api/v1/calendar/auth/sync`
    );
    expect(init?.method).toBe('POST');
    expect(await new Response(init?.body).text()).toBe(
      JSON.stringify({ calendarId: 'cal-1' })
    );
    const forwardedCookie = new Headers(init?.headers).get('cookie');
    expect(forwardedCookie).toContain('tuturuuu_app_session=fixture-token');
    expect(forwardedCookie).not.toContain('sb-test-auth-token');
  });

  it('relays the upstream error status unchanged', async () => {
    suppliers.fetch.mockImplementation(() =>
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await worker.fetch(
      request('/api/v1/calendar/auth', false),
      env,
      ctx
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});
