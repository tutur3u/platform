import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from '../proxy';

const nextResponseMocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  headerAppend: vi.fn(),
  hostOnlyClearForNames: vi.fn(
    (
      cookieNames: string[],
      options?: { path?: string; sameSite?: string; secure?: boolean }
    ) => {
      const attributes = [
        `Path=${options?.path ?? '/'}`,
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Max-Age=0',
      ];

      if (options?.sameSite === 'lax') {
        attributes.push('SameSite=Lax');
      }

      if (options?.secure) {
        attributes.push('Secure');
      }

      return [...new Set(cookieNames)].map(
        (name) => `${name}=; ${attributes.join('; ')}`
      );
    }
  ),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
    },
  })),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn().mockImplementation(() => ({
      headers: {
        get: () => null,
        set: () => {},
        append: nextResponseMocks.headerAppend,
        entries: () => [],
        [Symbol.iterator]: function* () {},
      },
      cookies: {
        get: () => null,
        set: nextResponseMocks.cookieSet,
        getAll: () => [],
      },
    })),
  },
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://test.supabase.co',
    key: 'test-key',
  }),
  getSupabaseCookieOptions: (url: string, requestUrl?: string) => {
    const isProductionTuturuuuHost = requestUrl?.includes('tuturuuu.com');
    const isLocalTuturuuuHost = requestUrl?.includes('tuturuuu.localhost');

    return {
      ...(isProductionTuturuuuHost ? { domain: '.tuturuuu.com' } : {}),
      ...(isLocalTuturuuuHost ? { domain: '.tuturuuu.localhost' } : {}),
      ...(isProductionTuturuuuHost ? { secure: true } : {}),
      ...(isLocalTuturuuuHost ? { secure: false } : {}),
      name: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
      path: '/',
      sameSite: 'lax',
    };
  },
  getHostOnlyCookieClearHeaders: (
    cookiesToSet: Array<{
      name: string;
      options: {
        domain?: string;
        path?: string;
        sameSite?: string;
        secure?: boolean;
      };
    }>
  ) =>
    cookiesToSet
      .filter((cookie) => cookie.options.domain)
      .flatMap((cookie) =>
        nextResponseMocks.hostOnlyClearForNames([cookie.name], cookie.options)
      ),
  getHostOnlyCookieClearHeadersForNames:
    nextResponseMocks.hostOnlyClearForNames,
  getSupabaseAuthCookieUrls: vi.fn((url: string) => [url]),
  getSupabaseAuthStorageKey: (url: string) =>
    `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
}));

describe('Supabase Proxy', () => {
  const mockRequest = {
    url: 'http://localhost:7803',
    headers: new Map(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVER_URL;
    delete process.env.SUPABASE_URL;
    mockRequest.url = 'http://localhost:7803';
    mockRequest.headers = new Map();
    mockRequest.cookies.getAll = () => [];
  });

  it('should create a response with the request', async () => {
    await updateSession(mockRequest as any);
    expect(NextResponse.next).toHaveBeenCalledWith({
      request: mockRequest,
    });
  });

  it('should check for user session', async () => {
    await updateSession(mockRequest as any);
    expect(createServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.any(Object)
    );
  });

  it('should handle cookies correctly', async () => {
    const mockCookies = [
      { name: 'test-cookie', value: 'test-value', options: {} },
    ];

    // Mock a client that sets cookies
    (createServerClient as any).mockImplementationOnce(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
      cookies: mockCookies,
    }));

    await updateSession(mockRequest as any);

    // Verify cookie handling setup
    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll).toBeDefined();
    expect(cookieHandler.setAll).toBeDefined();
  });

  it('expires host-only Supabase cookies when writing shared-domain cookies', async () => {
    await updateSession(mockRequest as any);

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    cookieHandler.setAll([
      {
        name: 'sb-test-auth-token.0',
        options: {
          domain: '.tuturuuu.com',
          path: '/',
          sameSite: 'lax',
          secure: true,
        },
        value: 'chunk',
      },
    ]);

    expect(nextResponseMocks.cookieSet).toHaveBeenCalledWith(
      'sb-test-auth-token.0',
      'chunk',
      expect.objectContaining({
        domain: '.tuturuuu.com',
      })
    );
    expect(nextResponseMocks.headerAppend).toHaveBeenCalledWith(
      'set-cookie',
      'sb-test-auth-token.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Secure'
    );
  });

  it('expires duplicate host-only Supabase cookies from raw request headers without a refresh write', async () => {
    mockRequest.url = 'https://tasks.tuturuuu.com';
    mockRequest.headers = new Map([
      [
        'cookie',
        [
          'theme=dark',
          'sb-test-auth-token.0=shared',
          'sb-test-auth-token.0=host',
        ].join('; '),
      ],
    ]);

    await updateSession(mockRequest as any);

    expect(nextResponseMocks.hostOnlyClearForNames).toHaveBeenCalledWith(
      ['sb-test-auth-token.0'],
      expect.objectContaining({
        domain: '.tuturuuu.com',
        path: '/',
        sameSite: 'lax',
        secure: true,
      })
    );
    expect(nextResponseMocks.headerAppend).toHaveBeenCalledWith(
      'set-cookie',
      'sb-test-auth-token.0=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax; Secure'
    );
  });

  it('expires duplicate host-only Supabase cookies for forwarded local E2E hosts', async () => {
    mockRequest.url = 'http://web-blue:7803';
    mockRequest.headers = new Map([
      ['host', 'tuturuuu.localhost'],
      ['x-forwarded-host', 'tuturuuu.localhost'],
      ['x-forwarded-proto', 'http'],
      [
        'cookie',
        [
          'theme=dark',
          'sb-test-auth-token=shared',
          'sb-test-auth-token=host',
        ].join('; '),
      ],
    ]);

    await updateSession(mockRequest as any);

    expect(nextResponseMocks.hostOnlyClearForNames).toHaveBeenCalledWith(
      ['sb-test-auth-token'],
      expect.objectContaining({
        domain: '.tuturuuu.localhost',
        path: '/',
        sameSite: 'lax',
        secure: false,
      })
    );
    expect(nextResponseMocks.headerAppend).toHaveBeenCalledWith(
      'set-cookie',
      'sb-test-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax'
    );
  });

  it('expires possible host-only Supabase cookies for shared-domain requests without duplicate header entries', async () => {
    mockRequest.url = 'http://web-blue:7803';
    mockRequest.headers = new Map([
      ['host', 'tuturuuu.localhost'],
      ['x-forwarded-host', 'tuturuuu.localhost'],
      ['x-forwarded-proto', 'http'],
      ['cookie', ['theme=dark', 'sb-test-auth-token=shared'].join('; ')],
    ]);

    await updateSession(mockRequest as any);

    expect(nextResponseMocks.hostOnlyClearForNames).toHaveBeenCalledWith(
      ['sb-test-auth-token'],
      expect.objectContaining({
        domain: '.tuturuuu.localhost',
        path: '/',
        sameSite: 'lax',
        secure: false,
      })
    );
    expect(nextResponseMocks.headerAppend).toHaveBeenCalledWith(
      'set-cookie',
      'sb-test-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax'
    );
  });

  it('should clear malformed Supabase auth cookies before getClaims', async () => {
    mockRequest.cookies.getAll = () => [
      {
        name: 'sb-test-auth-token',
        value: 'base64-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ',
      },
      { name: 'other', value: '1' },
    ];

    await updateSession(mockRequest as any);

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll()).toEqual([{ name: 'other', value: '1' }]);
    expect(mockRequest.cookies.set).toHaveBeenCalledWith(
      'sb-test-auth-token',
      ''
    );
  });

  it('mirrors compatible server-key cookies into the canonical public key before getClaims', async () => {
    const common = await import('../common');
    const session = JSON.stringify({
      access_token: 'jwt.with.dots',
      refresh_token: 'refresh',
    });
    vi.mocked(common.getSupabaseAuthCookieUrls).mockReturnValueOnce([
      'http://127.0.0.1:8001',
      'http://host.docker.internal:8001',
    ]);
    mockRequest.cookies.getAll = () => [
      {
        name: 'sb-host-auth-token',
        value: session,
      },
    ];

    await updateSession(mockRequest as any);

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll()).toEqual([
      { name: 'sb-127-auth-token', value: session },
    ]);
    expect(mockRequest.cookies.set).toHaveBeenCalledWith(
      'sb-127-auth-token',
      session
    );
    expect(nextResponseMocks.cookieSet).toHaveBeenCalledWith(
      'sb-127-auth-token',
      session,
      expect.objectContaining({
        maxAge: 34_560_000,
        path: '/',
        sameSite: 'lax',
      })
    );
  });

  it('should clear malformed chunked Supabase auth cookies before getClaims', async () => {
    mockRequest.cookies.getAll = () => [
      {
        name: 'sb-test-auth-token.1',
        value: 'base64-eyJhY2Nlc3NfdG9rZW4iOiJqd3QifQ',
      },
      { name: 'other', value: '1' },
    ];

    await updateSession(mockRequest as any);

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll()).toEqual([{ name: 'other', value: '1' }]);
    expect(mockRequest.cookies.set).toHaveBeenCalledWith(
      'sb-test-auth-token.1',
      ''
    );
  });

  it('should return response and JWT Payload', async () => {
    const response = await updateSession(mockRequest as any);
    expect(response.res).toBeDefined();
    expect(response.res.headers).toBeDefined();
    expect(response.claims).toBeNull();
  });
});
