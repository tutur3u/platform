import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it, vi } from 'vitest';
import {
  bridgeRequest,
  cookies,
  headers,
  withBridgeRequest,
} from '../server/request-context';
import { defaultProxyMatches, dispatchThroughProxy } from './proxy-bridge';

const waitUntil = (promise: Promise<unknown>) => {
  void promise;
};

describe('proxy bridge (ported from Meet)', () => {
  it.each([503, 403])(
    'passes terminal %i through without cookies or dispatch',
    async (status) => {
      const terminal = NextResponse.json(
        {
          error:
            status === 503 ? 'App session refresh unavailable' : 'MFA required',
        },
        { status, headers: { 'cache-control': 'no-store' } }
      );
      const response = await dispatchThroughProxy({
        request: new Request('https://meet.tuturuuu.com/en/personal/meetings'),
        waitUntil,
        proxy: async () => {
          (await cookies()).set('pending', 'must-not-escape');
          bridgeRequest().responseHeaders.set('location', '/login');
          return terminal;
        },
        dispatch: async () => {
          throw new Error('Terminal auth response must stop dispatch');
        },
      });
      expect(response).toBe(terminal);
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get('location')).toBeNull();
      expect(await response.json()).toEqual({
        error:
          status === 503 ? 'App session refresh unavailable' : 'MFA required',
      });
    }
  );

  it('retains redirects, status, query and multiple response cookies', async () => {
    const response = await dispatchThroughProxy({
      request: new Request(
        'https://meet.tuturuuu.com/vi/login?next=%2Fr%2Fcode'
      ),
      waitUntil,
      proxy: async () => {
        const result = NextResponse.redirect(
          'https://tuturuuu.com/login?returnUrl=meet',
          307
        );
        result.cookies.set('app', 'one', { httpOnly: true, secure: true });
        result.cookies.set('refresh', 'two', { httpOnly: true, path: '/' });
        return result;
      },
      dispatch: async () => {
        throw new Error('Redirect must terminate dispatch');
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/login?returnUrl=meet'
    );
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().join('\n')).toContain('HttpOnly');
  });

  it('forwards middleware refreshed identity headers and locale rewrites', async () => {
    const response = await dispatchThroughProxy({
      request: new Request(
        'https://meet.tuturuuu.com/personal/meetings?page=2',
        { headers: { cookie: 'app=old', 'x-remove': 'old' } }
      ),
      waitUntil,
      proxy: async () => {
        const result = NextResponse.rewrite(
          'https://meet.tuturuuu.com/en/personal/meetings?page=2',
          {
            request: {
              headers: new Headers({
                cookie: 'app=refreshed',
                'x-locale': 'en',
              }),
            },
          }
        );
        result.cookies.set('app', 'refreshed', { httpOnly: true });
        result.headers.set('content-language', 'en');
        return result;
      },
      dispatch: async (request) => {
        expect(request.nextUrl.pathname).toBe('/en/personal/meetings');
        expect(request.nextUrl.search).toBe('?page=2');
        expect((await headers()).get('cookie')).toBe('app=refreshed');
        expect(request.headers.has('x-remove')).toBe(false);
        (await cookies()).set('second', 'value', {
          secure: true,
          sameSite: 'lax',
        });
        return Response.json({ ok: true });
      },
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('content-language')).toBe('en');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it('preserves POST bodies and handler errors instead of replaying', async () => {
    let calls = 0;
    await expect(
      dispatchThroughProxy({
        request: new Request('https://meet.tuturuuu.com/api/meet-live/memory', {
          method: 'POST',
          body: '{"consent":true}',
        }),
        waitUntil,
        proxy: async () => NextResponse.next(),
        dispatch: async (request) => {
          calls++;
          expect(await request.json()).toEqual({ consent: true });
          throw new Error('unconfirmed write');
        },
      })
    ).rejects.toThrow('unconfirmed write');
    expect(calls).toBe(1);
  });

  it('keeps cookies and identity isolated across interleaved requests', async () => {
    let release: () => void = () => {
      throw new Error('Missing request barrier');
    };
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withBridgeRequest(
      {
        request: new NextRequest('https://meet.tuturuuu.com/', {
          headers: { cookie: 'actor=first' },
        }),
        responseHeaders: new Headers(),
        waitUntil,
      },
      async () => {
        await barrier;
        expect((await cookies()).get('actor')?.value).toBe('first');
      }
    );
    await withBridgeRequest(
      {
        request: new NextRequest('https://meet.tuturuuu.com/', {
          headers: { cookie: 'actor=second' },
        }),
        responseHeaders: new Headers(),
        waitUntil,
      },
      async () => {
        expect((await cookies()).get('actor')?.value).toBe('second');
        release();
        await first;
        expect((await cookies()).get('actor')?.value).toBe('second');
      }
    );
    expect(() => bridgeRequest()).toThrow(
      'Start bridge request context unavailable'
    );
  });

  it('does not run document authentication for excluded assets', async () => {
    expect(defaultProxyMatches('/api/build-info')).toBe(true);
    for (const path of [
      '/favicon.ico',
      '/robots.txt',
      '/_next/static/a.js',
      '/media/a.png',
    ])
      expect(defaultProxyMatches(path)).toBe(false);
    const response = await dispatchThroughProxy({
      request: new Request('https://meet.tuturuuu.com/media/a.png'),
      waitUntil,
      proxy: async () => {
        throw new Error('Asset must bypass proxy');
      },
      dispatch: async () => new Response('asset'),
    });
    expect(await response.text()).toBe('asset');
  });

  it('rejects an external rewrite before dispatch', async () => {
    await expect(
      dispatchThroughProxy({
        request: new Request('https://meet.tuturuuu.com/'),
        waitUntil,
        proxy: async () => NextResponse.rewrite('https://external.example/'),
        dispatch: async () => {
          throw new Error('Must not dispatch');
        },
      })
    ).rejects.toThrow('Unexpected external middleware rewrite');
  });
});

it('passes the navigation observer through initial and forwarded contexts', async () => {
  const { redirect } = await import('./navigation');
  const { isRedirect } = await import('@tanstack/react-router');
  const observed: string[] = [];
  const observeNavigation = (href: string) => {
    observed.push(href);
  };
  const result = await dispatchThroughProxy({
    request: new Request('https://meet.tuturuuu.com/login'),
    waitUntil,
    observeNavigation,
    proxy: async () => {
      expect(bridgeRequest().observeNavigation).toBe(observeNavigation);
      return NextResponse.rewrite('https://meet.tuturuuu.com/en/login');
    },
    dispatch: async () => {
      expect(bridgeRequest().observeNavigation).toBe(observeNavigation);
      try {
        redirect('https://tuturuuu.com/login?next=x');
      } catch (error) {
        expect(isRedirect(error)).toBe(true);
      }
      return new Response('ok');
    },
  });
  expect(await result.text()).toBe('ok');
  expect(observed).toEqual(['https://tuturuuu.com/login?next=x']);
});

it('presents an app-relative nextUrl under a basePath', async () => {
  const response = await dispatchThroughProxy({
    request: new Request('https://tuturuuu.com/meet/r/abc?x=1'),
    basePath: '/meet',
    waitUntil,
    proxy: async (request) => {
      expect(request.nextUrl.pathname).toBe('/r/abc');
      expect(request.nextUrl.basePath).toBe('/meet');
      const target = request.nextUrl.clone();
      target.pathname = '/login';
      return NextResponse.redirect(target);
    },
    dispatch: async () => {
      throw new Error('Redirect must terminate dispatch');
    },
  });
  expect(response.headers.get('location')).toBe(
    'https://tuturuuu.com/meet/login?x=1'
  );
});

it('forwards a middleware rewrite to an allowed central origin only', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const request = input as Request;
      expect(request.redirect).toBe('manual');
      expect(request.headers.get('host')).toBeNull();
      expect(await request.text()).toBe('{"a":1}');
      return new Response(`central ${request.method} ${request.url}`, {
        headers: { 'set-cookie': 'c=1; Path=/', connection: 'keep-alive' },
      });
    });
  const response = await dispatchThroughProxy({
    request: new Request('https://contacts.tuturuuu.com/api/topics/x', {
      method: 'POST',
      body: '{"a":1}',
      headers: { host: 'contacts.tuturuuu.com' },
    }),
    waitUntil,
    rewriteOrigins: ['https://tuturuuu.com'],
    proxy: async () =>
      NextResponse.rewrite('https://tuturuuu.com/api/v1/topics/x'),
    dispatch: async () => {
      throw new Error('Central rewrites must not dispatch locally');
    },
  });
  expect(await response.text()).toBe(
    'central POST https://tuturuuu.com/api/v1/topics/x'
  );
  expect(response.headers.getSetCookie()).toEqual(['c=1; Path=/']);
  expect(response.headers.get('connection')).toBeNull();
  fetchSpy.mockRestore();
  await expect(
    dispatchThroughProxy({
      request: new Request('https://contacts.tuturuuu.com/'),
      waitUntil,
      rewriteOrigins: ['https://tuturuuu.com'],
      proxy: async () => NextResponse.rewrite('https://evil.example/'),
      dispatch: async () => new Response('no'),
    })
  ).rejects.toThrow('Unexpected external middleware rewrite');
});
