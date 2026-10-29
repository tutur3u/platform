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

const asset = vi.fn(async () => new Response('asset'));
const env = { ASSETS: { fetch: asset } };
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
beforeEach(() => vi.resetAllMocks());

describe('Calendar cutover boundary', () => {
  it.each([
    'calendar.tuturuuu.com',
    'calendar.staging.tutur3u.com',
    'calendar-cutover.staging.tutur3u.com',
  ])(
    'threads a fresh CSP nonce through the proxy and Start on %s',
    async (host) => {
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
          new Request(`https://${host}/personal`),
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

  it.each([
    'unknown.invalid',
    'tuturuuu-calendar.workers.dev',
    'web.staging.tutur3u.com',
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

  it('does not forward cutover-host ACME requests through global fetch', async () => {
    suppliers.proxy.mockImplementation(() => NextResponse.next());
    suppliers.start.mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );
    const fetchOrigin = vi.spyOn(globalThis, 'fetch');
    try {
      const response = await handleCalendarRequest(
        new Request(
          'https://calendar-cutover.staging.tutur3u.com/.well-known/acme-challenge/probe'
        ),
        env,
        ctx,
        telemetry
      );
      expect(response.status).toBe(404);
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
