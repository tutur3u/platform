import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { describe, expect, it } from 'vitest';
import { dispatchThroughMailProxy, proxyMatches } from './proxy-bridge';
import {
  cookies,
  headers,
  mailRequest,
  withMailRequest,
} from './request-context';

const waitUntil = (promise: Promise<unknown>) => {
  void promise;
};

describe('Mail request bridge', () => {
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
      const response = await dispatchThroughMailProxy({
        request: new Request('https://mail.tuturuuu.com/en/personal/inbox'),
        waitUntil,
        proxy: async () => {
          (await cookies()).set('pending', 'must-not-escape');
          mailRequest().responseHeaders.set('location', '/login');
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
    const response = await dispatchThroughMailProxy({
      request: new Request(
        'https://mail.tuturuuu.com/vi/login?next=%2Fpersonal%2Finbox'
      ),
      waitUntil,
      proxy: async () => {
        const result = NextResponse.redirect(
          'https://tuturuuu.com/login?returnUrl=mail',
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
      'https://tuturuuu.com/login?returnUrl=mail'
    );
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie().join('\n')).toContain('HttpOnly');
  });

  it('forwards middleware refreshed identity headers and locale rewrites', async () => {
    const response = await dispatchThroughMailProxy({
      request: new Request('https://mail.tuturuuu.com/personal/inbox?page=2', {
        headers: { cookie: 'app=old', 'x-remove': 'old' },
      }),
      waitUntil,
      proxy: async () => {
        const result = NextResponse.rewrite(
          'https://mail.tuturuuu.com/en/personal/inbox?page=2',
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
        expect(request.nextUrl.pathname).toBe('/en/personal/inbox');
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
      dispatchThroughMailProxy({
        request: new Request(
          'https://mail.tuturuuu.com/api/v1/workspaces/tenant/mail/send',
          {
            method: 'POST',
            body: '{"draftId":"draft"}',
          }
        ),
        waitUntil,
        proxy: async () => NextResponse.next(),
        dispatch: async (request) => {
          calls++;
          expect(await request.json()).toEqual({ draftId: 'draft' });
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
    const first = withMailRequest(
      {
        request: new NextRequest('https://mail.tuturuuu.com/', {
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
    await withMailRequest(
      {
        request: new NextRequest('https://mail.tuturuuu.com/', {
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
    expect(() => mailRequest()).toThrow(
      'Start bridge request context unavailable'
    );
  });

  it('does not run document authentication for excluded assets', async () => {
    expect(proxyMatches('/api/build-info')).toBe(true);
    for (const path of [
      '/favicon.ico',
      '/robots.txt',
      '/_next/static/a.js',
      '/media/a.png',
    ])
      expect(proxyMatches(path)).toBe(false);
    const response = await dispatchThroughMailProxy({
      request: new Request('https://mail.tuturuuu.com/media/a.png'),
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
      dispatchThroughMailProxy({
        request: new Request('https://mail.tuturuuu.com/'),
        waitUntil,
        proxy: async () => NextResponse.rewrite('https://external.example/'),
        dispatch: async () => {
          throw new Error('Must not dispatch');
        },
      })
    ).rejects.toThrow('Unexpected external middleware rewrite');
  });
});
