// @vitest-environment node
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { handleCalendarRequest } from './handler';
import { LEGACY_SERVICE_WORKER_SOURCE } from './legacy-host';

const asset = vi.fn(async () => new Response('asset-bytes'));
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
const WORKSPACE = '/en/00000000-0000-4000-8000-000000000001?view=week';
const CALLBACKS = [
  '/api/v1/calendar/auth/callback',
  '/api/v1/calendar/auth/microsoft/callback',
] as const;
const SESSION_PATHS = [
  '/api/auth/logout',
  '/api/auth/refresh-app-session',
  '/api/auth/verify-app-token',
] as const;

function workerEnv(mode?: string) {
  return {
    ASSETS: { fetch: asset },
    ...(mode === undefined ? {} : { TTR_ONE_ORIGIN_CALENDAR: mode }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  suppliers.proxy.mockImplementation(async () => NextResponse.next());
  suppliers.start.mockResolvedValue(new Response('served'));
});

describe('Calendar one-origin activation', () => {
  it.each([undefined, 'off', 'later'])(
    'mode %j refuses the apex mount and keeps the subdomain',
    async (mode) => {
      const env = workerEnv(mode);
      const apex = await handleCalendarRequest(
        new Request('https://tuturuuu.com/calendar/personal'),
        env,
        ctx,
        telemetry
      );
      expect(apex.status).toBe(404);
      expect(await apex.text()).toBe('Not Found');
      expect(apex.headers.get('cache-control')).toMatch(/no-store/);
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();

      const page = await handleCalendarRequest(
        new Request(`https://calendar.tuturuuu.com${WORKSPACE}`),
        env,
        ctx,
        telemetry
      );
      expect(page.status).not.toBe(301);
      expect(page.headers.get('location') ?? '').not.toContain(
        'https://tuturuuu.com/calendar'
      );
      expect(suppliers.proxy).toHaveBeenCalled();
    }
  );

  it.each(['off', 'shadow'])(
    'mode %s serves registered callbacks and the installed service worker',
    async (mode) => {
      const env = workerEnv(mode);
      for (const path of CALLBACKS) {
        const response = await handleCalendarRequest(
          new Request(`https://calendar.tuturuuu.com${path}`),
          env,
          ctx,
          telemetry
        );
        expect(response.status).not.toBe(301);
        expect(response.headers.get('location') ?? '').not.toContain(
          'https://tuturuuu.com/calendar'
        );
      }
      const serviceWorker = await handleCalendarRequest(
        new Request('https://calendar.tuturuuu.com/serwist/sw.js'),
        env,
        ctx,
        telemetry
      );
      expect(serviceWorker.status).toBe(200);
      expect(await serviceWorker.text()).toBe('asset-bytes');
      expect(suppliers.proxy).toHaveBeenCalled();
    }
  );

  it('on redirects subdomain navigations and replaces the service worker', async () => {
    const env = workerEnv('on');
    const page = await handleCalendarRequest(
      new Request(`https://calendar.tuturuuu.com${WORKSPACE}`, {
        headers: { 'sec-fetch-mode': 'navigate' },
      }),
      env,
      ctx,
      telemetry
    );
    expect(page.status).toBe(301);
    expect(page.headers.get('location')).toBe(
      `https://tuturuuu.com/calendar${WORKSPACE}`
    );
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();

    const serviceWorker = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/serwist/sw.js'),
      env,
      ctx,
      telemetry
    );
    expect(await serviceWorker.text()).toBe(LEGACY_SERVICE_WORKER_SOURCE);
    expect(serviceWorker.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['/assets/verify-token.js', '/favicon.ico'])(
    'serves the legacy verifier asset %s on its own origin after activation',
    async (path) => {
      asset.mockResolvedValueOnce(new Response('asset-bytes'));
      const response = await handleCalendarRequest(
        new Request(`https://calendar.tuturuuu.com${path}`),
        workerEnv('on'),
        ctx,
        telemetry
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(await response.text()).toBe('asset-bytes');
    }
  );

  it('on keeps registered callback paths on the subdomain and fences their apex copies', async () => {
    const response = await handleCalendarRequest(
      new Request(
        'https://calendar.tuturuuu.com/api/v1/calendar/auth/microsoft/callback?code=1'
      ),
      workerEnv('on'),
      ctx,
      telemetry
    );
    expect(response.status).not.toBe(301);
    expect(response.headers.get('location')).toBeNull();
    expect(suppliers.proxy).toHaveBeenCalled();
    vi.clearAllMocks();
    const mounted = await handleCalendarRequest(
      new Request(
        'https://tuturuuu.com/calendar/api/v1/calendar/auth/microsoft/callback'
      ),
      workerEnv('on'),
      ctx,
      telemetry
    );
    expect(mounted.status).toBe(409);
    expect(mounted.headers.getSetCookie()).toEqual([]);
    expect(suppliers.proxy).not.toHaveBeenCalled();
  });

  it('passes scoped cookies through while blocking shared session writes', async () => {
    suppliers.start.mockImplementationOnce(async (request: Request) => {
      const cookie = request.headers.get('cookie') ?? '';
      expect(cookie).toContain('NEXT_LOCALE=en');
      expect(cookie).not.toContain('foreign=');
      const value = cookie
        .split(/;\s*/u)
        .find((part) => part.startsWith('sb-project-auth-token=base64-'))
        ?.slice('sb-project-auth-token=base64-'.length);
      expect(value).toBeTruthy();
      expect(
        JSON.parse(Buffer.from(value ?? '', 'base64url').toString())
      ).toEqual({
        access_token: 'fixture-access',
        refresh_token: '',
      });
      const headers = new Headers({ 'Clear-Site-Data': '"cookies"' });
      headers.append('set-cookie', 'sb-project-auth-token=ignored; Path=/');
      headers.append(
        'set-cookie',
        'NEXT_LOCALE=vi; Domain=.tuturuuu.com; Path=/'
      );
      return new Response('served', { headers });
    });
    const response = await handleCalendarRequest(
      new Request('https://tuturuuu.com/calendar/personal', {
        headers: {
          Cookie: [
            'foreign=ignore',
            'NEXT_LOCALE=en',
            'sb-project-auth-token=' +
              encodeURIComponent(
                JSON.stringify({
                  access_token: 'fixture-access',
                  refresh_token: 'fixture-refresh',
                  provider_token: 'fixture-provider',
                })
              ),
          ].join('; '),
        },
      }),
      workerEnv('shadow'),
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('clear-site-data')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([
      'NEXT_LOCALE=vi; Path=/calendar; Secure',
    ]);
  });

  it('shadow serves the apex mount', async () => {
    const response = await handleCalendarRequest(
      new Request('https://tuturuuu.com/calendar/personal'),
      workerEnv('shadow'),
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('served');
    expect(response.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(suppliers.proxy).toHaveBeenCalled();
  });

  it.each(['/api/v1/calendar/auth', '/api/v1/calendar/auth/microsoft'])(
    'starts %s on the registered subdomain for a mounted navigation',
    async (path) => {
      const response = await handleCalendarRequest(
        new Request(
          `https://tuturuuu.com/calendar${path}?wsId=personal&reconnect=1&navigation=1`
        ),
        workerEnv('shadow'),
        ctx,
        telemetry
      );
      const target = new URL(response.headers.get('location') ?? '');
      expect(response.status).toBe(307);
      expect(target.origin + target.pathname).toBe(
        `https://calendar.tuturuuu.com${path}`
      );
      expect(Object.fromEntries(target.searchParams)).toEqual({
        wsId: 'personal',
        reconnect: '1',
        navigation: '1',
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(suppliers.proxy).not.toHaveBeenCalled();
    }
  );

  it('keeps mounted session minting on Web and leaves the subdomain session routes alone', async () => {
    const env = workerEnv('shadow');
    for (const path of SESSION_PATHS) {
      vi.clearAllMocks();
      const apex = await handleCalendarRequest(
        new Request(`https://tuturuuu.com/calendar${path}`, { method: 'POST' }),
        env,
        ctx,
        telemetry
      );
      expect(apex.status).toBe(409);
      expect(await apex.json()).toEqual({
        error: 'The shared session is managed by Web',
      });
      expect(suppliers.proxy).not.toHaveBeenCalled();

      const subdomain = await handleCalendarRequest(
        new Request(`https://calendar.tuturuuu.com${path}`, { method: 'POST' }),
        env,
        ctx,
        telemetry
      );
      expect(subdomain.status).not.toBe(409);
      expect(suppliers.proxy).toHaveBeenCalled();
    }
  });
});
