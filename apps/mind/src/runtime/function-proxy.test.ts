import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shared: vi.fn(),
  refresh: vi.fn(),
  reject: vi.fn(),
}));
vi.mock('../../../../packages/start-bridge/src/next/function-proxy', () => ({
  createFunctionProxy: () => mocks.shared,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: mocks.refresh,
  propagateAuthCookies: (source: Response, target: Response) => {
    for (const cookie of source.headers.getSetCookie())
      target.headers.append('set-cookie', cookie);
  },
}));
vi.mock('./mounted-bearer', async () => ({
  ...(await vi.importActual<typeof import('./mounted-bearer')>(
    './mounted-bearer'
  )),
  refusesMountedAuthorization: mocks.reject,
}));
import { createFunctionProxy } from './function-proxy';

const PROVIDER = 'sb-nzamlzqfdwaaxdefwraj-auth-token';
const FRESH = `${PROVIDER}.0=fresh; Path=/; Max-Age=3600`;

function mounted(headers: Record<string, string> = {}) {
  return new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
    nextConfig: { basePath: '/mind' },
    headers: { cookie: `${PROVIDER}.0=current`, ...headers },
  });
}

function withCookies(response: NextResponse, ...cookies: string[]) {
  for (const cookie of cookies) response.headers.append('set-cookie', cookie);
  return response;
}

describe('Mind mounted server-function authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shared.mockResolvedValue(NextResponse.next());
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    mocks.reject.mockReturnValue(false);
  });
  it.each(['', 'mind_locale=en', 'sb-fixture-auth-token=invalid'])(
    'uses strict mode for any Cookie header %j, even with a bearer',
    async (cookie) => {
      const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
        nextConfig: { basePath: '/mind' },
        headers: { cookie, authorization: 'Bearer fixture' },
      });
      await createFunctionProxy({ targetApp: 'mind' })(req);
      expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(req, {
        sessionMode: 'supabase-only',
        targetApp: 'mind',
      });
      expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    }
  );
  it('keeps admitted coordination bearers on their existing endpoint verification path', async () => {
    const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
      nextConfig: { basePath: '/mind' },
      headers: { authorization: 'Bearer coordination' },
    });
    const response = await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('refuses a mounted Authorization before shared dispatch', async () => {
    mocks.reject.mockReturnValue(true);
    const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
      nextConfig: { basePath: '/mind' },
      headers: { authorization: 'Bearer legacy' },
    });
    const response = await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.shared).not.toHaveBeenCalled();
  });
  it.each([
    ['Shared session unavailable', 401],
    ['App signed out', 401],
    ['MFA required', 403],
    ['Account assurance unavailable', 503],
    ['App session refresh unavailable', 503],
  ])(
    'answers a %s refusal without expiring Web cookies',
    async (error, status) => {
      const staleChunk = `${PROVIDER}.1=; Path=/; Max-Age=0`;
      mocks.refresh.mockResolvedValue({
        ok: false,
        error,
        response: withCookies(
          NextResponse.next(),
          FRESH,
          staleChunk,
          'sb-otherprojectref-auth-token=; Path=/; Max-Age=0'
        ),
      });
      const response = await createFunctionProxy({ targetApp: 'mind' })(
        mounted()
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      // Only the assurance refusals carry the refresh's cookie writes.
      expect(response.headers.getSetCookie()).toEqual(
        status === 401 || error === 'App session refresh unavailable'
          ? []
          : [FRESH, staleChunk]
      );
      expect(mocks.shared).not.toHaveBeenCalled();
    }
  );
  it('drops the shared proxy cookie clearing from a mounted guard refusal', async () => {
    mocks.shared.mockResolvedValue(
      withCookies(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
        `${PROVIDER}-legacy=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`
      )
    );
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: withCookies(NextResponse.next(), FRESH),
    });
    const response = await createFunctionProxy({ targetApp: 'mind' })(
      mounted()
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.getSetCookie()).toEqual([FRESH]);
  });
  it('marks a personalised mounted response private, no-store', async () => {
    const response = await createFunctionProxy({ targetApp: 'mind' })(
      mounted()
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('keeps root-host behavior unchanged', async () => {
    const req = new NextRequest('https://mind.tuturuuu.com/_serverFn/id');
    const response = await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
