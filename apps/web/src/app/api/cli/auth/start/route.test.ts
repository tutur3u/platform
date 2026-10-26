import { generateAssuredCrossAppToken } from '@tuturuuu/auth/cross-app/server';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@tuturuuu/auth/cross-app/server', () => ({
  generateAssuredCrossAppToken: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(),
}));

const APP_ORIGIN_ENV_KEYS = [
  'WEB_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'COOLIFY_URL',
  'COOLIFY_FQDN',
] as const;

function clearConfiguredAppOrigins() {
  for (const key of APP_ORIGIN_ENV_KEYS) {
    vi.stubEnv(key, '');
  }
}

const NAVIGATION_HEADERS = {
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
};

function navigation(url: string, init?: { headers?: Record<string, string> }) {
  return new NextRequest(url, {
    headers: { ...NAVIGATION_HEADERS, ...init?.headers },
  });
}

describe('CLI auth start route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({} as never);
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: { email: 'ada@example.com', id: 'user-1' },
    } as never);
    vi.mocked(generateAssuredCrossAppToken).mockResolvedValue('cli-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects only to loopback callback URLs', async () => {
    const response = await GET(
      navigation(
        'https://tuturuuu.com/api/cli/auth/start?state=s1&redirect_uri=http%3A%2F%2F127.0.0.1%3A4389%2Fcallback'
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:4389/callback?token=cli-token&state=s1&email=ada%40example.com'
    );
  });

  it('rejects non-loopback callback URLs', async () => {
    const response = await GET(
      navigation(
        'https://tuturuuu.com/api/cli/auth/start?state=s1&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback'
      )
    );

    expect(response.status).toBe(400);
  });

  it('redirects unauthenticated CLI login through the configured public app origin', async () => {
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: null,
    } as never);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com');

    const response = await GET(
      navigation(
        'http://0.0.0.0:7803/api/cli/auth/start?state=s1&redirect_uri=http%3A%2F%2F127.0.0.1%3A4389%2Fcallback'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tuturuuu.com/api/cli/auth/start?state=s1&redirect_uri=http%3A%2F%2F127.0.0.1%3A4389%2Fcallback'
    );
  });

  it('uses forwarded public host headers when the request origin is a wildcard bind address', async () => {
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: null,
    } as never);
    clearConfiguredAppOrigins();

    const response = await GET(
      navigation('http://0.0.0.0:7803/api/cli/auth/start?state=s1&mode=copy', {
        headers: {
          'x-forwarded-host': 'tuturuuu.com',
          'x-forwarded-proto': 'https',
        },
      })
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy'
    );
  });

  it('falls back to tuturuuu.com when configured app origins are unset', async () => {
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: null,
    } as never);
    clearConfiguredAppOrigins();

    const response = await GET(
      navigation('http://0.0.0.0:7803/api/cli/auth/start?state=s1&mode=copy')
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy'
    );
  });

  it('renders a copy token page in copy mode', async () => {
    const response = await GET(
      navigation('https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy')
    );

    expect(response.headers.get('content-type')).toContain('text/html');
    await expect(response.text()).resolves.toContain('ada@example.com');
  });

  it('does not forward bearer authorization headers into the browser login flow', async () => {
    vi.mocked(resolveAuthenticatedSessionUser).mockResolvedValue({
      authError: null,
      user: null,
    } as never);

    const response = await GET(
      navigation('https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy', {
        headers: {
          authorization: 'Bearer valid-but-not-browser-session-token',
        },
      })
    );

    expect(createClient).toHaveBeenCalledWith();
    expect(generateAssuredCrossAppToken).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('serves the copy page in an opaque, opener-isolated origin', async () => {
    const response = await GET(
      navigation('https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
    );
    expect(response.headers.get('cross-origin-opener-policy')).toBe(
      'same-origin'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('cli-token');
    expect(html).not.toContain('<script');
  });

  it('answers json clients with the sandboxed html page, never a json token', async () => {
    const response = await GET(
      navigation('https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy', {
        headers: { accept: 'application/json' },
      })
    );

    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox'
    );
  });

  it('validates the callback before minting a token', async () => {
    const response = await GET(
      navigation(
        'https://tuturuuu.com/api/cli/auth/start?state=s1&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback'
      )
    );

    expect(response.status).toBe(400);
    expect(generateAssuredCrossAppToken).not.toHaveBeenCalled();
  });

  it.each([
    ['a same-origin fetch', { mode: 'cors', dest: 'empty' }],
    ['a same-origin no-cors fetch', { mode: 'no-cors', dest: 'empty' }],
    ['an iframe navigation', { mode: 'navigate', dest: 'iframe' }],
    ['a request without Fetch Metadata', null],
  ])('refuses to mint a CLI token for %s', async (_label, fetchMetadata) => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/cli/auth/start?state=s1&mode=copy',
        {
          headers: {
            accept: 'application/json',
            ...(fetchMetadata
              ? {
                  'sec-fetch-dest': fetchMetadata.dest,
                  'sec-fetch-mode': fetchMetadata.mode,
                  'sec-fetch-site': 'same-origin',
                }
              : {}),
          },
        }
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'CLI_LOGIN_NAVIGATION_REQUIRED',
    });
    expect(createClient).not.toHaveBeenCalled();
    expect(generateAssuredCrossAppToken).not.toHaveBeenCalled();
  });

  it.each([
    '/api/cli/auth/%73tart',
    '/api/cli/auth/st%61rt',
    '/api/cli/%61uth/start',
    '/api/%63li/auth/%73t%61rt',
  ])(
    'refuses the non-canonical spelling %s without minting',
    async (pathname) => {
      const response = await GET(
        navigation(`https://tuturuuu.com${pathname}?state=s1&mode=copy`)
      );

      expect(response.status).toBe(404);
      expect(createClient).not.toHaveBeenCalled();
      expect(generateAssuredCrossAppToken).not.toHaveBeenCalled();
    }
  );
});
