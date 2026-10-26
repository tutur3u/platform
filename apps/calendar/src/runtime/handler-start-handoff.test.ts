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
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
}));

import { handleCalendarRequest } from './handler';

const env = {
  ASSETS: {
    fetch: async () => {
      throw new Error('Start handoff must not fetch assets');
    },
  },
};
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
const rawBody = '{ "revision": 7, "consent": true }';
const rawQuery = '?cursor=a%2Bb&x=1&x=2';
function mutation(path: string) {
  return new Request(`https://calendar.tuturuuu.com${path}${rawQuery}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'app=one; refresh=two',
      origin: 'https://calendar.tuturuuu.com',
    },
    body: rawBody,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
});

describe('actual Calendar handler to Start handoff', () => {
  it('passes a native JSON mutation once and preserves supplier failure identity', async () => {
    const request = mutation('/_fn/fixture');
    const failure = new Error('unconfirmed Start write');
    suppliers.start.mockImplementationOnce(async (forwarded) => {
      expect(forwarded.url).toBe(request.url);
      expect(forwarded.method).toBe('POST');
      expect(new URL(forwarded.url).search).toBe(rawQuery);
      expect(forwarded.headers.get('cookie')).toBe('app=one; refresh=two');
      expect(forwarded.bodyUsed).toBe(false);
      expect(await forwarded.text()).toBe(rawBody);
      expect(forwarded.bodyUsed).toBe(true);
      await expect(forwarded.text()).rejects.toThrow();
      throw failure;
    });
    await expect(
      handleCalendarRequest(request, env, ctx, telemetry)
    ).rejects.toBe(failure);
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(suppliers.proxy).not.toHaveBeenCalled();
  });

  it('keeps the original URL after real middleware rewriting while retaining refreshed headers and body', async () => {
    const request = mutation('/personal');
    suppliers.proxy.mockResolvedValueOnce(
      NextResponse.rewrite(
        'https://calendar.tuturuuu.com/vi/personal?view=day',
        {
          request: {
            headers: new Headers({
              'content-type': 'application/json',
              cookie: 'app=rotated; refresh=two',
              'x-next-intl-locale': 'vi',
            }),
          },
        }
      )
    );
    suppliers.start.mockImplementationOnce(async (forwarded) => {
      expect(forwarded.url).toBe(request.url);
      expect(new URL(forwarded.url).search).toBe(rawQuery);
      expect(forwarded.method).toBe('POST');
      expect(forwarded.headers.get('cookie')).toBe('app=rotated; refresh=two');
      expect(forwarded.headers.get('x-next-intl-locale')).toBe('vi');
      expect(await forwarded.text()).toBe(rawBody);
      return new Response('Start accepted bytes', { status: 207 });
    });
    const response = await handleCalendarRequest(request, env, ctx, telemetry);
    expect(response.status).toBe(207);
    expect(await response.text()).toBe('Start accepted bytes');
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(suppliers.proxy).toHaveBeenCalledTimes(1);
  });
});

it('captures a sanitized owning failure without replacing its identity', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new TypeError('PRIVATE_SENTINEL never log this');
  suppliers.start.mockRejectedValueOnce(failure);
  suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
  try {
    await expect(
      handleCalendarRequest(
        new Request('https://calendar.tuturuuu.com/verify-token'),
        env,
        ctx,
        telemetry
      )
    ).rejects.toBe(failure);
    expect(log).toHaveBeenCalledWith('calendar-ssr-error category=TYPE_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SENTINEL');
  } finally {
    log.mockRestore();
  }
});

it('captures real asynchronous response-policy rejection after successful asset dispatch', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new TypeError('PRIVATE_POLICY_SENTINEL');
  let headerReads = 0;
  class PolicyFailureResponse extends Response {
    override get headers(): Headers {
      headerReads += 1;
      throw failure;
    }
  }
  const fetchAsset = vi.fn(async () => new PolicyFailureResponse('asset'));
  try {
    await expect(
      handleCalendarRequest(
        new Request('https://calendar.tuturuuu.com/assets/fixture.js'),
        { ASSETS: { fetch: fetchAsset } },
        ctx,
        telemetry
      )
    ).rejects.toBe(failure);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(headerReads).toBe(1);
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([
      ['calendar-ssr-error category=TYPE_ERROR'],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'PRIVATE_POLICY_SENTINEL'
    );
  } finally {
    log.mockRestore();
  }
});

it('retains a returned 500 body and security policy without inventing an owning exception', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
  suppliers.start.mockResolvedValueOnce(
    new Response('upstream failed', {
      status: 500,
      headers: { 'content-type': 'text/html', 'x-owner': 'calendar' },
    })
  );
  try {
    const response = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/verify-token'),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('upstream failed');
    expect(response.headers.get('x-owner')).toBe('calendar');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

describe('actual Calendar handler asset and API owner dispatch', () => {
  it.each(['GET', 'HEAD'])(
    'serves %s service worker bytes with cache and scope headers before auth or Start',
    async (method) => {
      const asset = new Response(
        method === 'HEAD' ? null : 'service worker bytes',
        {
          status: 203,
          statusText: 'Asset supplier',
          headers: {
            'content-type': 'application/javascript',
            'x-asset': 'serwist',
            'cache-control': 'public, max-age=3600',
            'service-worker-allowed': '/serwist/',
          },
        }
      );
      const fetchAsset = vi.fn(async (_request: Request) => asset);
      const request = new Request(
        'https://calendar.tuturuuu.com/serwist/sw.js?revision=7',
        { method }
      );
      const response = await handleCalendarRequest(
        request,
        { ASSETS: { fetch: fetchAsset } },
        ctx,
        telemetry
      );
      expect(fetchAsset).toHaveBeenCalledExactlyOnceWith(request);
      expect(response.status).toBe(203);
      expect(response.statusText).toBe('Asset supplier');
      expect(await response.text()).toBe(
        method === 'HEAD' ? '' : 'service worker bytes'
      );
      expect(response.headers.get('content-type')).toBe(
        'application/javascript'
      );
      expect(response.headers.get('x-asset')).toBe('serwist');
      expect(response.headers.get('service-worker-allowed')).toBe('/');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();
    }
  );

  it.each(['GET', 'HEAD'])(
    'keeps %s ordinary asset cache policy without granting service worker scope',
    async (method) => {
      const request = new Request(
        'https://calendar.tuturuuu.com/assets/fixture.js',
        {
          method,
        }
      );
      const fetchAsset = vi.fn(
        async (_request: Request) =>
          new Response(method === 'HEAD' ? null : 'ordinary bytes', {
            status: 206,
            headers: {
              'cache-control': 'public, max-age=86400',
              'x-asset': 'ordinary',
            },
          })
      );
      const response = await handleCalendarRequest(
        request,
        { ASSETS: { fetch: fetchAsset } },
        ctx,
        telemetry
      );
      expect(fetchAsset).toHaveBeenCalledExactlyOnceWith(request);
      expect(response.status).toBe(206);
      expect(await response.text()).toBe(
        method === 'HEAD' ? '' : 'ordinary bytes'
      );
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=86400'
      );
      expect(response.headers.get('service-worker-allowed')).toBeNull();
      expect(response.headers.get('x-asset')).toBe('ordinary');
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();
    }
  );

  it.each(['/serwist/sw.js', '/assets/fixture.js'])(
    'does not use the asset fast path for POST %s',
    async (path) => {
      const request = mutation(path);
      const fetchAsset = vi.fn(async () => new Response('unexpected asset'));
      suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
      suppliers.start.mockImplementationOnce(async (forwarded) => {
        expect(forwarded.method).toBe('POST');
        expect(forwarded.url).toBe(request.url);
        expect(await forwarded.text()).toBe(rawBody);
        return new Response('Start mutation', { status: 202 });
      });
      const response = await handleCalendarRequest(
        request,
        { ASSETS: { fetch: fetchAsset } },
        ctx,
        telemetry
      );
      expect(response.status).toBe(202);
      expect(await response.text()).toBe('Start mutation');
      expect(response.headers.get('service-worker-allowed')).toBeNull();
      expect(fetchAsset).not.toHaveBeenCalled();
      expect(suppliers.proxy).toHaveBeenCalledTimes(1);
      expect(suppliers.start).toHaveBeenCalledTimes(1);
    }
  );

  it('forwards Tasks PATCH bytes once and preserves owner response data through policy', async () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.test');
    const path = '/api/v1/workspaces/ws/tasks/task';
    const request = new Request(
      `https://calendar.tuturuuu.com${path}${rawQuery}`,
      {
        method: 'PATCH',
        body: rawBody,
        headers: {
          host: 'untrusted.test',
          cookie: 'app=one; refresh=two',
          'content-type': 'application/json',
          'x-forwarded-host': 'spoofed.test',
          'x-forwarded-proto': 'http',
        },
      }
    );
    const ownerHeaders = new Headers({
      'content-type': 'application/json',
      'x-owner': 'tasks',
      'content-security-policy': "default-src 'self'",
    });
    ownerHeaders.append('set-cookie', 'app=rotated; Path=/; HttpOnly');
    ownerHeaders.append('set-cookie', 'refresh=rotated; Path=/; HttpOnly');
    const owner = new Response('{"updated":true}', {
      status: 207,
      statusText: 'Tasks accepted',
      headers: ownerHeaders,
    });
    const fetchOwner = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (!(input instanceof Request))
          throw new Error('expected owner Request');
        expect(input.url).toBe(`https://tasks.test${path}${rawQuery}`);
        expect(input.method).toBe('PATCH');
        expect(input.redirect).toBe('manual');
        expect(input.headers.get('host')).toBeNull();
        expect(input.headers.get('x-forwarded-host')).toBe('calendar.test');
        expect(input.headers.get('x-forwarded-proto')).toBe('https');
        expect(input.headers.get('cookie')).toBe('app=one; refresh=two');
        expect(input.headers.get('content-type')).toBe('application/json');
        expect(input.bodyUsed).toBe(false);
        expect(await input.text()).toBe(rawBody);
        await expect(input.text()).rejects.toThrow();
        return owner;
      });
    suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
    try {
      const response = await handleCalendarRequest(
        request,
        env,
        ctx,
        telemetry
      );
      expect(response.body).toBe(owner.body);
      expect(response.status).toBe(207);
      expect(response.statusText).toBe('Tasks accepted');
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('x-owner')).toBe('tasks');
      expect(response.headers.getSetCookie()).toEqual(
        ownerHeaders.getSetCookie()
      );
      expect(response.headers.get('content-security-policy')).toContain(
        "default-src 'self'"
      );
      expect(response.headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'"
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(await response.text()).toBe('{"updated":true}');
      expect(fetchOwner).toHaveBeenCalledTimes(1);
      expect(suppliers.proxy).toHaveBeenCalledTimes(1);
      expect(suppliers.start).not.toHaveBeenCalled();
    } finally {
      fetchOwner.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it.each([
    '/api/v1/workspaces/ws/settings/permissions',
    '/api/unknown-calendar-owner-boundary',
  ])(
    'forwards Web-owned or unknown API %s without falling through to Start',
    async (path) => {
      vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.test');
      const request = new Request(
        `https://calendar.tuturuuu.com${path}${rawQuery}`,
        {
          headers: { cookie: 'app=one; refresh=two' },
        }
      );
      const fetchOwner = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input) => {
          if (!(input instanceof Request))
            throw new Error('expected owner Request');
          expect(input.url).toBe(`https://web.test${path}${rawQuery}`);
          expect(input.method).toBe('GET');
          expect(input.redirect).toBe('manual');
          expect(input.headers.get('cookie')).toBe('app=one; refresh=two');
          expect(input.headers.get('x-forwarded-host')).toBe('calendar.test');
          expect(input.headers.get('x-forwarded-proto')).toBe('https');
          return new Response('Web owner redirect', {
            status: 307,
            headers: { location: '/login', 'x-owner': 'web' },
          });
        });
      suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
      try {
        const response = await handleCalendarRequest(
          request,
          env,
          ctx,
          telemetry
        );
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('/login');
        expect(response.headers.get('x-owner')).toBe('web');
        expect(response.headers.get('x-frame-options')).toBe('DENY');
        expect(await response.text()).toBe('Web owner redirect');
        expect(fetchOwner).toHaveBeenCalledTimes(1);
        expect(suppliers.proxy).toHaveBeenCalledTimes(1);
        expect(suppliers.start).not.toHaveBeenCalled();
      } finally {
        fetchOwner.mockRestore();
        vi.unstubAllEnvs();
      }
    }
  );

  it('propagates an unknown Tasks write failure by identity without replay or Start fallback', async () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.test');
    const failure = new TypeError('PRIVATE_OWNER_FAILURE');
    const fetchOwner = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        if (!(input instanceof Request))
          throw new Error('expected owner Request');
        expect(input.method).toBe('PATCH');
        expect(await input.text()).toBe(rawBody);
        throw failure;
      });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
    try {
      await expect(
        handleCalendarRequest(
          new Request(
            `https://calendar.tuturuuu.com/api/v1/workspaces/ws/tasks/task${rawQuery}`,
            {
              method: 'PATCH',
              body: rawBody,
              headers: {
                'content-type': 'application/json',
                cookie: 'app=one',
              },
            }
          ),
          env,
          ctx,
          telemetry
        )
      ).rejects.toBe(failure);
      expect(fetchOwner).toHaveBeenCalledTimes(1);
      expect(suppliers.proxy).toHaveBeenCalledTimes(1);
      expect(suppliers.start).not.toHaveBeenCalled();
      expect(log.mock.calls).toEqual([
        ['calendar-ssr-error category=TYPE_ERROR'],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'PRIVATE_OWNER_FAILURE'
      );
    } finally {
      fetchOwner.mockRestore();
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe('root-only Calendar handler ownership', () => {
  it('serves the root service worker with root control', async () => {
    const asset = vi.fn(async (request: Request) => {
      expect(request.url).toBe(
        'https://calendar.tuturuuu.com/serwist/sw.js?x=1'
      );
      return new Response('worker');
    });
    const response = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/serwist/sw.js?x=1'),
      { ASSETS: { fetch: asset } },
      ctx,
      telemetry
    );
    expect(response.headers.get('service-worker-allowed')).toBe('/');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toBe('worker');
    expect(suppliers.proxy).not.toHaveBeenCalled();
  });
  it.each([
    '/calendar',
    '/calendar/serwist/sw.js',
    '/calendar/api/build-info',
    '/calendar/_calendar/functions/fixture',
    '/api/build-info',
    '/mail/verify-token',
    '/calendarish',
  ])('rejects the held apex path %s without dispatch', async (path) => {
    const asset = vi.fn(async () => new Response('asset'));
    const request = new Request(`https://tuturuuu.com${path}`, {
      method: 'POST',
      body: rawBody,
      headers: { 'x-forwarded-host': 'calendar.tuturuuu.com' },
    });
    const response = await handleCalendarRequest(
      request,
      { ASSETS: { fetch: asset } },
      ctx,
      telemetry
    );
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(request.bodyUsed).toBe(false);
    expect(asset).not.toHaveBeenCalled();
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
  });
});
