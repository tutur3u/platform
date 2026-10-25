// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const guard = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<Response | null>>(async () => null)
);
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: guard,
}));

import { apiRequest } from './api.server';
import { NextRequest } from '@tuturuuu/start-bridge/next/server';

afterEach(() => {
  vi.unstubAllGlobals();
  guard.mockReset();
  guard.mockResolvedValue(null);
});
describe('Apps central API ownership', () => {
  it('returns the actual guard denial without contacting the owner', async () => {
    guard.mockResolvedValue(new Response('denied', { status: 403 }));
    const upstream = vi.fn<typeof fetch>();
    const result = await apiRequest(
      new Request('https://apps.tuturuuu.com/api/v1/workspaces/other'),
      'https://tuturuuu.com',
      upstream
    );
    expect(result.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(guard.mock.calls[0]?.[1]).toEqual({ prefixBase: 'proxy:apps:api' });
  });
  it('forwards exact method, body, query, cookies and central denial without retry', async () => {
    let seen = 0;
    const upstream: typeof fetch = async (input) => {
      seen++;
      const request = new Request(input);
      expect(request.url).toBe(
        'https://tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2'
      );
      expect(request.method).toBe('PATCH');
      expect(request.headers.get('cookie')).toBe(
        'tuturuuu_app_session=fixture'
      );
      expect(await request.text()).toBe('{"title":"exact"}');
      return new Response('tenant denied', {
        status: 403,
        headers: [
          ['Set-Cookie', 'a=1; Path=/'],
          ['Set-Cookie', 'b=2; Path=/'],
        ],
      });
    };
    const result = await apiRequest(
      new Request(
        'https://apps.tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2',
        {
          method: 'PATCH',
          body: '{"title":"exact"}',
          headers: { cookie: 'tuturuuu_app_session=fixture' },
        }
      ),
      'https://tuturuuu.com',
      upstream
    );
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('tenant denied');
    expect(result.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    expect(seen).toBe(1);
  });
  it('answers build-info OPTIONS with exact empty 204 and Allow without upstream access', async () => {
    const upstream = vi.fn<typeof fetch>();
    const unexpectedFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', unexpectedFetch);
    const response = await apiRequest(
      new Request('https://apps.tuturuuu.com/api/build-info', {
        method: 'OPTIONS',
      }),
      'https://tuturuuu.com',
      upstream
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    expect(upstream).not.toHaveBeenCalled();
    expect(unexpectedFetch).not.toHaveBeenCalled();
    expect(guard).toHaveBeenCalledTimes(1);
  });
  it('owns only build-info and rejects central proxy loops', async () => {
    expect(
      (
        await apiRequest(
          new Request('https://apps.tuturuuu.com/api/build-info', {
            method: 'POST',
          }),
          'https://tuturuuu.com'
        )
      ).status
    ).toBe(405);
    expect(
      (
        await apiRequest(
          new Request('https://apps.tuturuuu.com/api/v1/private'),
          'https://apps.tuturuuu.com'
        )
      ).status
    ).toBe(503);
    const response = await apiRequest(
      new Request('https://apps.tuturuuu.com/api/build-info'),
      'https://tuturuuu.com'
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ appName: 'apps' });
  });
});

describe('Apps Web Request boundary', () => {
  it.each(['GET', 'HEAD', 'POST', 'DELETE'])(
    'preserves %s semantics while the guard consumes its own body',
    async (method) => {
      const payload = '{"title":"streamed"}';
      const hasBody = method === 'POST' || method === 'DELETE';
      const headers = new Headers({
        authorization: 'Bearer fixture',
        cookie: 'tuturuuu_app_session=fixture; preference=compact',
        origin: 'https://apps.tuturuuu.com',
        'x-forwarded-for': '192.0.2.1',
        'x-real-ip': '192.0.2.2',
        'cf-connecting-ip': '192.0.2.3',
        'content-type': 'application/json; charset=utf-8',
      });
      const init: RequestInit & { duplex: 'half' } = {
        method,
        headers,
        redirect: 'manual',
        duplex: 'half',
      };
      if (hasBody) {
        init.body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(payload.slice(0, 8)));
            controller.enqueue(new TextEncoder().encode(payload.slice(8)));
            controller.close();
          },
        });
      }
      const incoming = new Request(
        'https://apps.tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2',
        init
      );
      guard.mockImplementation(async (candidate, options) => {
        expect(candidate).toBeInstanceOf(NextRequest);
        if (!(candidate instanceof NextRequest)) {
          throw new Error('Guard requires a real NextRequest');
        }
        expect(options).toEqual({ prefixBase: 'proxy:apps:api' });
        expect(candidate.url).toBe(incoming.url);
        expect(candidate.nextUrl.pathname).toBe('/api/v1/workspaces/other');
        expect(candidate.nextUrl.searchParams.getAll('tag')).toEqual([
          '1',
          '2',
        ]);
        expect(candidate.method).toBe(method);
        expect(candidate.redirect).toBe('manual');
        expect([...candidate.headers]).toEqual([...headers]);
        expect(candidate.cookies.get('tuturuuu_app_session')?.value).toBe(
          'fixture'
        );
        expect(candidate.cookies.get('preference')?.value).toBe('compact');
        expect(await candidate.clone().text()).toBe(hasBody ? payload : '');
        expect(await candidate.text()).toBe(hasBody ? payload : '');
        expect(incoming.bodyUsed).toBe(false);
        return null;
      });
      const unexpectedFetch = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', unexpectedFetch);
      const upstream = vi.fn<typeof fetch>(async (input) => {
        const forwarded = new Request(input);
        expect(forwarded.url).toBe(
          'https://tuturuuu.com/api/v1/workspaces/other?tag=1&tag=2'
        );
        expect(forwarded.method).toBe(method);
        expect([...forwarded.headers]).toEqual([...headers]);
        expect(await forwarded.text()).toBe(hasBody ? payload : '');
        return new Response(null, { status: 204 });
      });
      expect(
        (await apiRequest(incoming, 'https://tuturuuu.com', upstream)).status
      ).toBe(204);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(unexpectedFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { method: 'GET', body: undefined },
    { method: 'POST', body: '{"title":"valid"}' },
    { method: 'POST', body: '{malformed-json' },
  ])(
    'retains the real guard outcome for $method $body',
    async ({ method, body }) => {
      expect(process.env.NODE_ENV).toBe('test');
      const actual = await vi.importActual<
        typeof import('@tuturuuu/utils/api-proxy-guard')
      >('@tuturuuu/utils/api-proxy-guard');
      guard.mockImplementation(async (candidate, options) => {
        if (!(candidate instanceof NextRequest)) {
          throw new Error('Guard requires a real NextRequest');
        }
        expect(options).toEqual({ prefixBase: 'proxy:apps:api' });
        const result = await actual.guardApiProxyRequest(candidate, {
          prefixBase: 'proxy:apps:api',
        });
        expect(result).toBeNull();
        return result;
      });
      const unexpectedFetch = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', unexpectedFetch);
      const init: RequestInit & { duplex: 'half' } = {
        method,
        headers: { 'content-type': 'application/json' },
        duplex: 'half',
      };
      if (body !== undefined) {
        init.body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        });
      }
      const upstream = vi.fn<typeof fetch>(async (input) => {
        const forwarded = new Request(input);
        expect(forwarded.method).toBe(method);
        expect(forwarded.headers.get('content-type')).toBe('application/json');
        expect(await forwarded.text()).toBe(body ?? '');
        return new Response('owner accepted', { status: 202 });
      });
      const result = await apiRequest(
        new Request('https://apps.tuturuuu.com/api/v1/workspaces/other', init),
        'https://tuturuuu.com',
        upstream
      );
      expect(result.status).toBe(202);
      expect(await result.text()).toBe('owner accepted');
      expect(guard).toHaveBeenCalledTimes(1);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(unexpectedFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    { count: 10, status: 202 },
    { count: 11, status: 400 },
  ])(
    'applies the real content guard to a streamed POST with $count emojis',
    async ({ count, status }) => {
      expect(process.env.NODE_ENV).toBe('test');
      const actual = await vi.importActual<
        typeof import('@tuturuuu/utils/api-proxy-guard')
      >('@tuturuuu/utils/api-proxy-guard');
      let denial: Response | null = null;
      guard.mockImplementation(async (candidate) => {
        if (!(candidate instanceof NextRequest)) {
          throw new Error('Guard requires a real NextRequest');
        }
        denial = await actual.guardApiProxyRequest(candidate, {
          prefixBase: 'proxy:apps:api',
        });
        return denial;
      });
      const payload = JSON.stringify({ title: '\u{1f600}'.repeat(count) });
      const init: RequestInit & { duplex: 'half' } = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(payload));
            controller.close();
          },
        }),
        duplex: 'half',
      };
      const incoming = new Request(
        'https://apps.tuturuuu.com/api/v1/workspaces/other',
        init
      );
      const unexpectedFetch = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', unexpectedFetch);
      const upstream = vi.fn<typeof fetch>(async (input) => {
        expect(await new Request(input).text()).toBe(payload);
        return new Response(null, { status: 202 });
      });
      const result = await apiRequest(
        incoming,
        'https://tuturuuu.com',
        upstream
      );
      expect(result.status).toBe(status);
      if (status === 400) {
        expect(result).toBe(denial);
        expect(await result.json()).toEqual({
          error: 'Bad Request',
          message: 'Field "body.title" cannot contain more than 10 emojis',
          code: 'EMOJI_LIMIT_EXCEEDED',
          field: 'body.title',
          count: 11,
          limit: 10,
        });
        expect(await incoming.text()).toBe(payload);
        expect(upstream).not.toHaveBeenCalled();
      } else {
        expect(denial).toBeNull();
        expect(upstream).toHaveBeenCalledTimes(1);
      }
      expect(guard).toHaveBeenCalledTimes(1);
      expect(unexpectedFetch).not.toHaveBeenCalled();
    }
  );

  it('returns the exact real payload denial without central fetch or write', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const actual = await vi.importActual<
      typeof import('@tuturuuu/utils/api-proxy-guard')
    >('@tuturuuu/utils/api-proxy-guard');
    let denial: Response | null = null;
    guard.mockImplementation(async (candidate) => {
      if (!(candidate instanceof NextRequest)) {
        throw new Error('Guard requires a real NextRequest');
      }
      denial = await actual.guardApiProxyRequest(candidate, {
        prefixBase: 'proxy:apps:api',
      });
      return denial;
    });
    const unexpectedFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', unexpectedFetch);
    const upstream = vi.fn<typeof fetch>();
    const incoming = new Request(
      'https://apps.tuturuuu.com/api/v1/workspaces/other',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(512 * 1024 + 1),
        },
        body: '{"title":"unchanged"}',
      }
    );
    const result = await apiRequest(incoming, 'https://tuturuuu.com', upstream);
    expect(result).toBe(denial);
    expect(result.status).toBe(413);
    expect(await result.json()).toEqual({
      error: 'Payload Too Large',
      message: 'Request body exceeds limit',
    });
    expect(await incoming.text()).toBe('{"title":"unchanged"}');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(upstream).not.toHaveBeenCalled();
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });
});
