import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => mocks.createClient(),
}));

let mapUrlToApp: typeof import('./index').mapUrlToApp;
let verifyRouteToken: typeof import('./index').verifyRouteToken;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';

  ({ mapUrlToApp, verifyRouteToken } = await import('./index.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      refreshSession: vi.fn().mockResolvedValue({}),
      setSession: vi.fn().mockResolvedValue({ error: null }),
    },
  });
});

function createMockRouter() {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  };
}

describe('mapUrlToApp', () => {
  it('maps the CMS production URL to the cms app', () => {
    expect(
      mapUrlToApp('https://cms.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('cms');
  });

  it('maps the CMS development URL to the cms app', () => {
    expect(mapUrlToApp('http://localhost:7811/verify-token?nextUrl=%2F')).toBe(
      'cms'
    );
  });

  it('maps the Learn production URL to the learn app', () => {
    expect(
      mapUrlToApp('https://learn.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('learn');
  });

  it('maps the Teach development URL to the teach app', () => {
    expect(mapUrlToApp('http://localhost:7813/verify-token?nextUrl=%2F')).toBe(
      'teach'
    );
  });

  it('rejects hostname prefix lookalikes', () => {
    expect(mapUrlToApp('https://learn.tuturuuu.com.evil.test')).toBeNull();
  });
});

describe('verifyRouteToken', () => {
  it('redirects instead of hanging when token verification returns a non-JSON error', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2F&token=dummy'),
      token: 'dummy',
    });

    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('stores the returned session before redirecting to the requested route', async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const router = createMockRouter();
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        refreshSession: vi.fn().mockResolvedValue({}),
        setSession,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(router.push).toHaveBeenCalledWith('/personal');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('does not read the stale local session before verifying a fresh token', async () => {
    const getUser = vi
      .fn()
      .mockRejectedValue(
        new Error('Invalid Refresh Token: Refresh Token not found')
      );
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const router = createMockRouter();
    mocks.createClient.mockReturnValue({
      auth: {
        getUser,
        refreshSession: vi.fn().mockResolvedValue({}),
        setSession,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(getUser).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(router.push).toHaveBeenCalledWith('/personal');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('does not refresh a stale local session when token verification returns no session', async () => {
    const refreshSession = vi
      .fn()
      .mockRejectedValue(
        new Error('Invalid Refresh Token: Refresh Token not found')
      );
    const router = createMockRouter();
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        refreshSession,
        setSession: vi.fn().mockResolvedValue({ error: null }),
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          sessionCreated: false,
          userId: 'user-1',
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(refreshSession).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('redirects when token verification returns no user id', async () => {
    const router = createMockRouter();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          valid: true,
        })
      )
    );

    await verifyRouteToken({
      router,
      searchParams: new URLSearchParams('nextUrl=%2Fpersonal'),
      token: 'token-1',
    });

    expect(router.push).toHaveBeenCalledWith('/');
    expect(router.refresh).toHaveBeenCalled();
  });
});
