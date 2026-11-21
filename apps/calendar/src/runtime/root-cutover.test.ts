// @vitest-environment node
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarTelemetryPort } from './request-telemetry.server';
import { applyCalendarResponsePolicy } from './response-policy';

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

const asset = vi.fn(async () => new Response('asset'));
const env = { ASSETS: { fetch: asset }, TTR_ONE_ORIGIN_CALENDAR: 'shadow' };
const apexRedirect = { ...env, TTR_ONE_ORIGIN_CALENDAR: 'on' };
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
beforeEach(() => vi.resetAllMocks());

describe('Calendar cutover boundary', () => {
  it.each(['https://tuturuuu.com/calendar/personal'])(
    'threads a fresh CSP nonce through the proxy and Start on %s',
    async (url) => {
      const seen: string[] = [];
      suppliers.proxy.mockImplementation(async () => {
        const nonce = requestNonce();
        expect(nonce).toMatch(/^[\w+/]{22}==$/u);
        if (nonce) seen.push(nonce);
        return NextResponse.next();
      });
      suppliers.start.mockImplementation(async () => {
        expect(requestNonce()).toBe(seen.at(-1));
        return new Response('signed root');
      });
      for (let i = 0; i < 2; i++) {
        const response = await handleCalendarRequest(
          new Request(url),
          env,
          ctx,
          telemetry
        );
        expect(await response.text()).toBe('signed root');
        expect(response.headers.get('content-security-policy')).toContain(
          `script-src 'nonce-${seen.at(-1)}' 'strict-dynamic'`
        );
        expect(response.headers.get('cache-control')).toBe('private, no-store');
      }
      expect(seen).toHaveLength(2);
      expect(seen[0]).not.toBe(seen[1]);
    }
  );

  // The production artifact (pinned profile) must not answer staging (N8),
  // the retired smoke hosts or former production-zone staging names.
  it.each([
    'unknown.invalid',
    'tuturuuu-calendar.workers.dev',
    'web.tutur3u.com',
    'calendar.tutur3u.com',
    // Retired temporary production-smoke host; the canonical flip is accepted.
    'calendar-cutover.tutur3u.com',
    'calendar-cutover.tuturuuu.com',
    'calendar-staging.tuturuuu.com',
  ])('rejects %s before middleware, assets or SSR', async (host) => {
    const response = await handleCalendarRequest(
      new Request(`https://${host}/`, {
        headers: { 'x-forwarded-host': 'calendar.tuturuuu.com' },
      }),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(asset).not.toHaveBeenCalled();
  });

  it('does not forward legacy-host ACME requests through global fetch', async () => {
    const fetchOrigin = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await handleCalendarRequest(
        new Request(
          'https://calendar.tuturuuu.com/.well-known/acme-challenge/probe'
        ),
        apexRedirect,
        ctx,
        telemetry
      );
      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(
        'https://tuturuuu.com/calendar/.well-known/acme-challenge/probe'
      );
      expect(fetchOrigin).not.toHaveBeenCalled();
    } finally {
      fetchOrigin.mockRestore();
    }
  });

  it.each(['GET', 'HEAD'])(
    'serves exact public build-info %s without ambient auth or dispatch',
    async (method) => {
      const response = await handleCalendarRequest(
        new Request('https://calendar.tuturuuu.com/api/build-info', {
          method,
          headers: {
            cookie: 'invalid=fixture',
            authorization: 'Bearer fixture',
          },
        }),
        env,
        ctx,
        telemetry
      );
      expect(response.status).toBe(200);
      if (method === 'HEAD') expect(await response.text()).toBe('');
      else expect((await response.json()).appName).toBe('calendar');
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();
      expect(asset).not.toHaveBeenCalled();
    }
  );

  it.each(['/personal', '/api/v1/calendar/connections', '/_fn/fixture'])(
    'forces no-store on %s including CDN overrides',
    async (path) => {
      const response = await applyCalendarResponsePolicy(
        new Request(`https://calendar.tuturuuu.com${path}`),
        new Response('private', {
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'Cloudflare-CDN-Cache-Control': 'max-age=3600',
          },
        }),
        'fixture'
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin'
      );
    }
  );
});

describe('legacy calendar.tuturuuu.com host when apex redirect is on', () => {
  const methods = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ] as const;
  it.each([
    ['/', '/calendar'],
    ['/en/personal', '/calendar/en/personal'],
    [
      '/00000000-0000-4000-8000-000000000001?date=2026-11-15',
      '/calendar/00000000-0000-4000-8000-000000000001?date=2026-11-15',
    ],
    [
      '/settings?x=1&x=2&next=%2Fabc%3Fa%3D1&empty=',
      '/calendar/settings?x=1&x=2&next=%2Fabc%3Fa%3D1&empty=',
    ],
    ['/login?next=%2Fabc', '/calendar/login?next=%2Fabc'],
    ['/offline.html', '/calendar/offline.html'],
    ['/calendar/personal', '/calendar/personal'],
  ])('sends %s to the apex mount before auth', async (path, to) => {
    for (const method of methods) {
      const response = await handleCalendarRequest(
        new Request(`https://calendar.tuturuuu.com${path}`, {
          method,
          headers: { cookie: 'sb-fixture-auth-token=stale' },
        }),
        apexRedirect,
        ctx,
        telemetry
      );
      expect(response.status).toBe(
        method === 'GET' || method === 'HEAD' ? 301 : 307
      );
      expect(response.headers.get('location')).toBe(
        `https://tuturuuu.com${to}`
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(asset).not.toHaveBeenCalled();
  });

  it.each(['/verify-token?nextUrl=%2Fabc', '/api/v1/calendar/connections'])(
    'keeps %s on the existing host when the page redirect is on',
    async (path) => {
      suppliers.proxy.mockResolvedValueOnce(
        NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      );
      const response = await handleCalendarRequest(
        new Request(`https://calendar.tuturuuu.com${path}`),
        apexRedirect,
        ctx,
        telemetry
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('location')).toBeNull();
      expect(suppliers.proxy).toHaveBeenCalledOnce();
    }
  );

  it('keeps serving build-info for monitoring', async () => {
    const response = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/api/build-info'),
      apexRedirect,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('location')).toBe(false);
    expect((await response.json()).appName).toBe('calendar');
  });

  it('answers the service-worker path with a self-removing worker', async () => {
    const response = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/serwist/sw.js?revision=7'),
      apexRedirect,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8'
    );
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    const source = await response.text();
    expect(source).toBe(LEGACY_SERVICE_WORKER_SOURCE);
    for (const marker of [
      'self.skipWaiting()',
      'caches.delete(key)',
      'self.registration.unregister()',
      "self.clients.matchAll({ type: 'window' })",
      'tab.navigate(tab.url)',
    ]) {
      expect(source).toContain(marker);
    }
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(asset).not.toHaveBeenCalled();
  });

  it('leaves the apex mount itself to the app', async () => {
    suppliers.proxy.mockImplementation(async () => NextResponse.next());
    suppliers.start.mockResolvedValue(new Response('mounted'));
    const response = await handleCalendarRequest(
      new Request('https://tuturuuu.com/calendar/personal'),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('mounted');
  });
});
