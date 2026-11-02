import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarTelemetryPort } from './request-telemetry.server';

const suppliers = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: suppliers.start }),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('../proxy', () => ({ proxy: suppliers.proxy }));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
}));
// Staging admits only Access-verified requests; this suite exercises the
// owner dispatch behind that fence, so the verifier is the sole stub.
vi.mock('@tuturuuu/utils/cloudflare-access', async (importActual) => ({
  ...(await importActual<typeof import('@tuturuuu/utils/cloudflare-access')>()),
  verifyCloudflareAccessRequest: async () => true,
}));

import { handleCalendarRequest } from './handler';
import { resolveCalendarTasksOrigin } from './tasks-origin';

const env = {
  ASSETS: {
    fetch: async () => {
      throw new Error('Tasks dispatch must not fetch assets');
    },
  },
};
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
const sessionCookie = 'sb-staging-auth-token=STAGING_SESSION_SENTINEL';

function tasksRequest() {
  return new Request(
    'https://calendar.tuturuuu.com/api/v1/workspaces/ws/tasks/task',
    {
      method: 'PATCH',
      body: '{"name":"x"}',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
    }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('TASKS_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_TASKS_APP_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('staging Calendar Tasks owner dispatch', () => {
  beforeEach(() => {
    vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', 'staging');
    suppliers.proxy.mockResolvedValue(NextResponse.next());
  });

  it('fails closed without forwarding any cookie when no Tasks URL is set', async () => {
    const fetchOwner = vi.spyOn(globalThis, 'fetch');
    const response = await handleCalendarRequest(
      tasksRequest(),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('STAGING_SESSION_SENTINEL');
    expect(fetchOwner).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
  });

  it.each([
    'https://tasks.tuturuuu.com',
    'https://tuturuuu.com',
    'https://tasks.tuturuuu.com/',
    'https://tasks.tuturuuu.com.',
    'https://TASKS.TUTURUUU.COM',
    'http://tasks.staging.example.test',
  ])('refuses %s as the staging Tasks URL', async (value) => {
    vi.stubEnv('TASKS_APP_URL', value);
    const fetchOwner = vi.spyOn(globalThis, 'fetch');
    const response = await handleCalendarRequest(
      tasksRequest(),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(503);
    expect(fetchOwner).not.toHaveBeenCalled();
  });

  it('forwards only to the explicitly configured staging host', async () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.staging.example.test');
    const fetchOwner = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (!(input instanceof Request))
          throw new Error('expected owner Request');
        expect(new URL(input.url).origin).toBe(
          'https://tasks.staging.example.test'
        );
        expect(input.headers.get('cookie')).toBe(sessionCookie);
        return new Response('ok', { status: 200 });
      });
    const response = await handleCalendarRequest(
      tasksRequest(),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(fetchOwner).toHaveBeenCalledTimes(1);
  });
});

describe('production Calendar Tasks owner dispatch', () => {
  beforeEach(() => {
    vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', 'production');
    suppliers.proxy.mockResolvedValue(NextResponse.next());
  });

  it('keeps the explicit production Tasks origin without a configured URL', async () => {
    const fetchOwner = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (!(input instanceof Request))
          throw new Error('expected owner Request');
        expect(new URL(input.url).origin).toBe('https://tasks.tuturuuu.com');
        return new Response('ok', { status: 200 });
      });
    const response = await handleCalendarRequest(
      new Request(
        'https://calendar.tuturuuu.com/api/v1/workspaces/ws/tasks/task',
        { method: 'PATCH', body: '{}', headers: { cookie: 'app=one' } }
      ),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(fetchOwner).toHaveBeenCalledTimes(1);
  });
});

describe('resolveCalendarTasksOrigin', () => {
  it.each([
    ['staging', '', null],
    ['staging', 'https://tasks.tuturuuu.com', null],
    ['staging', 'https://evil.tuturuuu.com', null],
    ['staging', 'https://tasks.tuturuuu.com.', null],
    ['staging', 'https://TASKS.TUTURUUU.COM', null],
    ['staging', 'https://TASKS.TUTURUUU.COM.', null],
    ['staging', 'https://tuturuuu.com.', null],
    [
      'staging',
      'https://tasks.staging.example.test.',
      'https://tasks.staging.example.test.',
    ],
    ['staging', 'http://tasks.example.test', null],
    ['staging', 'not a url', null],
    [
      'staging',
      'https://tasks.staging.example.test/',
      'https://tasks.staging.example.test',
    ],
    ['production', '', 'https://tasks.tuturuuu.com'],
    ['production', 'https://tasks.test', 'https://tasks.test'],
  ])('%s with TASKS_APP_URL=%j resolves %j', (profile, value, expected) => {
    vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
    vi.stubEnv('TASKS_APP_URL', value);
    expect(resolveCalendarTasksOrigin()).toBe(expected);
  });

  it('keeps a local Tasks origin in development', () => {
    vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', 'development');
    expect(resolveCalendarTasksOrigin()).toMatch(/^http:\/\/|^https:\/\//u);
    expect(resolveCalendarTasksOrigin()).not.toContain('tuturuuu.com');
  });
});
