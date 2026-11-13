import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import { APP_BASE_HEADER } from '@tuturuuu/start-bridge/mounts';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, expect, it, vi } from 'vitest';
import type { CalendarTelemetryPort } from './request-telemetry.server';

const suppliers = vi.hoisted(() => ({ start: vi.fn(), proxy: vi.fn() }));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: suppliers.start }),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('../proxy', () => ({ proxy: suppliers.proxy }));
import { handleCalendarRequest } from './handler';

const env = { ASSETS: { fetch: vi.fn() }, TTR_ONE_ORIGIN_CALENDAR: 'shadow' };
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
const apex = 'https://tuturuuu.com';
beforeEach(() => {
  vi.resetAllMocks();
  suppliers.proxy.mockImplementation(async () => NextResponse.next());
  suppliers.start.mockImplementation(async () => new Response('SSR fixture'));
});

it('serves the bare mount internally as a slash with the trusted hydration base', async () => {
  suppliers.start.mockImplementation(async (request: Request) => {
    expect(request.url).toBe(`${apex}/calendar/?x=1&x=2`);
    expect(runtimeAppBase()).toBe('/calendar');
    expect(request.headers.get(APP_BASE_HEADER)).toBe('/calendar');
    return new Response('SSR fixture');
  });
  const response = await handleCalendarRequest(
    new Request(`${apex}/calendar?x=1&x=2`, {
      headers: { [APP_BASE_HEADER]: '/spoofed' },
    }),
    env,
    ctx,
    telemetry
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(suppliers.start).toHaveBeenCalledTimes(1);
});

it.each([
  { origin: 'https://attacker.test', 'sec-fetch-site': 'cross-site' },
  { origin: 'https://calendar.tuturuuu.com' },
  { 'sec-fetch-site': 'cross-site' },
  {},
] as Record<string, string>[])(
  'refuses mounted cookie mutations before proxy/SSR with headers %j',
  async (headers) => {
    const request = new Request(`${apex}/calendar/personal`, {
      method: 'POST',
      body: 'fixture',
      headers: { cookie: 'sb-fixture-auth-token=session', ...headers },
    });
    const response = await handleCalendarRequest(request, env, ctx, telemetry);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(request.bodyUsed).toBe(false);
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
  }
);

it.each([{ origin: apex }, { 'sec-fetch-site': 'same-origin' }] as Record<
  string,
  string
>[])(
  'admits same-origin mounted mutations without consuming the body',
  async (headers) => {
    suppliers.start.mockImplementation(async (request: Request) => {
      expect(request.method).toBe('POST');
      expect(await request.text()).toBe('fixture');
      return new Response('accepted');
    });
    const response = await handleCalendarRequest(
      new Request(`${apex}/calendar/personal`, {
        method: 'POST',
        body: 'fixture',
        headers: { cookie: 'sb-fixture-auth-token=session', ...headers },
      }),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(suppliers.start).toHaveBeenCalledTimes(1);
  }
);

it.each([
  '/api/auth/logout',
  '/api/auth/refresh-app-session',
  '/api/auth/verify-app-token',
])(
  'retains the mounted 409 for %s even before CSRF admission',
  async (path) => {
    const response = await handleCalendarRequest(
      new Request(`${apex}/calendar${path}`, { method: 'POST' }),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(suppliers.proxy).not.toHaveBeenCalled();
  }
);

it('returns the meet-together redirect without reapplying the Calendar base', async () => {
  const response = await handleCalendarRequest(
    new Request(`${apex}/calendar/meet-together/id?x=1&x=2`, {
      headers: { accept: 'text/html' },
    }),
    { ...env, TTR_ONE_ORIGIN_CALENDAR: 'on' },
    ctx,
    telemetry
  );
  expect(response.status).toBe(301);
  expect(response.headers.get('location')).toBe(
    `${apex}/meet-together/id?x=1&x=2`
  );
  expect(suppliers.proxy).not.toHaveBeenCalled();
});
