import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  guard: vi.fn(),
  propagate: vi.fn(),
  hasWebSession: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: mocks.hasWebSession,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  appSessionFailureResponse: () =>
    NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
  preserveMfaRecoveryCookies: (_request: unknown, response: unknown) =>
    response,
  consumeVerifyTokenRequest: vi.fn(),
  getRequestHeadersWithResponseCookies: (request: NextRequest) => {
    const headers = new Headers(request.headers);
    headers.set('authorization', 'Bearer fixture');
    return headers;
  },
  propagateAuthCookies: mocks.propagate,
  refreshAppSessionForRequest: mocks.refresh,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('@tuturuuu/utils/shared-cookie', () => ({
  getTuturuuuSharedCookieOptions: vi.fn(),
}));
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn() }));

import { WEB_APP_URL } from './constants/common';
import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ ok: true, response: NextResponse.next() });
  mocks.guard.mockResolvedValue(null);
});
const path = '/api/v1/workspaces/synthetic-workspace/topic-announcements';
describe('topic read ownership preserves the mutation fallback', () => {
  it.each([
    ['GET', path],
    ['HEAD', path],
    ['POST', `${path}/preview`],
  ])(
    '%s %s remains local or uses its original fallback',
    async (method, pathname) => {
      const result = await proxy(
        new NextRequest(`https://contacts.example.test${pathname}`, { method })
      );
      expect(result.headers.get('x-middleware-rewrite')).toBeNull();
      expect(result.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refresh).toHaveBeenCalledWith(expect.anything(), {
        sessionMode: 'supabase-first',
        targetApp: 'contacts',
      });
      expect(mocks.guard).toHaveBeenCalledOnce();
    }
  );
  it.each([
    ['GET', '/schedule?month=2026-10'],
    ['PUT', '/schedule'],
    ['POST', '/schedule/clone'],
    ['GET', '/contacts'],
    ['POST', '/contacts'],
    ['GET', '/templates'],
    ['POST', '/notify-teachers'],
    ['POST', '/announcements/id/send'],
    ['PATCH', '/contacts/id'],
    ['DELETE', '/templates/id'],
  ])('forwards %s %s after session and API guards', async (method, suffix) => {
    const request = new NextRequest(
      `https://contacts.example.test${path}${suffix}`,
      { method }
    );
    const result = await proxy(request);
    const target = new URL(result.headers.get('x-middleware-rewrite')!);
    expect(target.pathname + target.search).toBe(path + suffix);
    expect(target.hostname).not.toBe('contacts.example.test');
    expect(mocks.refresh).toHaveBeenCalledWith(request, {
      sessionMode: 'supabase-first',
      targetApp: 'contacts',
    });
    expect(mocks.guard).toHaveBeenCalledOnce();
    expect(mocks.propagate).toHaveBeenCalledWith(expect.anything(), result);
  });
  it('forwards collection POST without dropping its query or refreshed cookies', async () => {
    const result = await proxy(
      new NextRequest(`https://contacts.example.test${path}?source=synthetic`, {
        method: 'POST',
      })
    );
    const target = new URL(result.headers.get('x-middleware-rewrite')!);
    expect(target.pathname).toBe(path);
    expect(target.search).toBe('?source=synthetic');
    expect(target.hostname).not.toBe('contacts.example.test');
    expect(mocks.propagate).toHaveBeenCalledWith(expect.anything(), result);
  });
  it.each(['revoked', 'wrong-audience'])(
    'does not forward %s sessions rejected by the verified boundary',
    async () => {
      mocks.refresh.mockResolvedValue({ ok: false });
      const result = await proxy(
        new NextRequest(`https://contacts.example.test${path}`, {
          method: 'POST',
        })
      );
      expect(result.status).toBe(401);
      expect(result.headers.get('x-middleware-rewrite')).toBeNull();
      expect(mocks.guard).not.toHaveBeenCalled();
    }
  );
  it('preserves the API edge guard before forwarding', async () => {
    mocks.guard.mockResolvedValue(
      NextResponse.json({ message: 'Blocked' }, { status: 429 })
    );
    const result = await proxy(
      new NextRequest(`https://contacts.example.test${path}`, {
        method: 'POST',
      })
    );
    expect(result.status).toBe(429);
    expect(result.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('workspace redirects stay on Web', () => {
  it.each([
    ['https://contacts.tuturuuu.com', ''],
    ['https://tuturuuu.com', '/contacts'],
  ])('rejects an ambiguous leading path on %s', async (origin, basePath) => {
    mocks.hasWebSession.mockReturnValue(true);
    mocks.refresh.mockResolvedValue({
      ok: true,
      claims: { sub: 'fixture' },
      response: NextResponse.next(),
    });
    const result = await proxy(
      new NextRequest(`${origin}${basePath}//foreign-host/workspace/billing`, {
        nextConfig: { basePath },
      })
    );
    expect(result.status).toBe(400);
    expect(result.headers.get('location')).toBeNull();
  });

  it.each([
    ['https://contacts.tuturuuu.com', ''],
    ['https://tuturuuu.com', '/contacts'],
  ])(
    'keeps normalized workspace redirects on Web from %s',
    async (origin, basePath) => {
      mocks.hasWebSession.mockReturnValue(true);
      mocks.refresh.mockResolvedValue({
        ok: true,
        claims: { sub: 'fixture' },
        response: NextResponse.next(),
      });
      for (const path of [
        '/%2F%2Fforeign-host',
        '/%5Cforeign-host',
        '/\\foreign-host',
        '/\t/foreign-host',
        '/\n/foreign-host',
        '/..//foreign-host',
        '/%2e%2e//foreign-host',
      ]) {
        const result = await proxy(
          new NextRequest(`${origin}${basePath}${path}/workspace/billing`, {
            nextConfig: { basePath },
          })
        );
        const location = result.headers.get('location');
        if (location === null) {
          expect(result.status, JSON.stringify(path)).toBe(400);
          continue;
        }

        expect(result.status, JSON.stringify(path)).toBe(307);
        expect(new URL(location).origin, JSON.stringify(path)).toBe(
          new URL(WEB_APP_URL).origin
        );
      }
    }
  );

  it('preserves a Web-owned workspace path and query from the apex mount', async () => {
    mocks.hasWebSession.mockReturnValue(true);
    mocks.refresh.mockResolvedValue({
      ok: true,
      claims: { sub: 'fixture' },
      response: NextResponse.next(),
    });
    const result = await proxy(
      new NextRequest(
        'https://tuturuuu.com/contacts/workspace/billing?tab=history',
        { nextConfig: { basePath: '/contacts' } }
      )
    );
    expect(result.status).toBe(307);
    const target = new URL(result.headers.get('location') ?? '');
    expect(target.pathname + target.search).toBe(
      '/workspace/billing?tab=history'
    );
  });
});

describe('contact account-link proxy', () => {
  const origin = 'https://contacts.example.test';
  const linkPath = '/api/v1/workspaces/synthetic-workspace/users/links/repair';

  it('rejects cross-origin actions before forwarding to the web app', async () => {
    const response = await proxy(
      new NextRequest(origin + linkPath, {
        method: 'POST',
        headers: { origin: 'https://other.example.test' },
      })
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('forwards same-origin actions with the verified session and destination origin', async () => {
    const response = await proxy(
      new NextRequest(origin + linkPath, {
        method: 'POST',
        headers: { origin },
      })
    );
    const destination = new URL(response.headers.get('x-middleware-rewrite')!);
    expect(destination.pathname).toBe(linkPath);
    expect(response.headers.get('x-middleware-request-origin')).toBe(
      destination.origin
    );
    expect(response.headers.get('x-middleware-request-authorization')).toBe(
      'Bearer fixture'
    );
  });
});
