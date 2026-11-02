import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

function clearConfiguredWebOrigins() {
  vi.stubEnv('PORTLESS_URL', '');
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('PORTLESS_PORT', '');
  vi.stubEnv('WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('COOLIFY_URL', '');
  vi.stubEnv('COOLIFY_FQDN', '');
}

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConfiguredWebOrigins();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['guard throws', 'invalid-jwt', false, 'auth_failed'],
    [
      'reject cleanup throws',
      'unexpected-amr',
      true,
      'azure_tenant_restricted',
    ],
    [
      'unexpected amr shape',
      'unexpected-amr',
      false,
      'azure_tenant_restricted',
    ],
  ])(
    'cleans up after %s',
    async (_name, tokenKind, cleanupThrows, errorCode) => {
      const payload = Buffer.from(
        JSON.stringify({ amr: { method: 'oauth' } })
      ).toString('base64url');
      const signOut = cleanupThrows
        ? vi.fn().mockRejectedValue(new Error('cleanup failed'))
        : vi.fn().mockResolvedValue({ error: null });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mocks.createClient.mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token:
                  tokenKind === 'invalid-jwt'
                    ? 'invalid-jwt'
                    : `e30.${payload}.signature`,
                user: { app_metadata: { provider: 'azure' }, identities: [] },
              },
            },
            error: null,
          }),
          signOut,
        },
      });
      try {
        const response = await GET(
          new NextRequest('http://localhost/api/auth/callback?code=oauth-code')
        );
        const location = new URL(response.headers.get('location') ?? '');
        expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
        expect(location.pathname).toBe('/login');
        expect(location.searchParams.get('error')).toBe(errorCode);
        if (cleanupThrows) {
          expect(consoleError).toHaveBeenCalledWith(
            '[auth/callback] Failed to clear local session'
          );
        }
      } finally {
        consoleError.mockRestore();
      }
    }
  );

  it('flattens same-origin nested returnUrl redirects', async () => {
    const nestedReturnUrl = encodeURIComponent(
      'http://localhost/login?returnUrl=%2Fworkspace%2Fdemo%3Ftab%3Dmail'
    );
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?returnUrl=${nestedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/workspace/demo?tab=mail'
    );
  });

  it('routes trusted external app returnUrl values through login confirmation', async () => {
    const externalReturnUrl = encodeURIComponent('https://cms.tuturuuu.com');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?returnUrl=${externalReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?returnUrl=https%3A%2F%2Fcms.tuturuuu.com'
    );
  });

  it('redirects managed wildcard Tuturuuu returnUrl values directly', async () => {
    const managedReturnUrl = encodeURIComponent(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${managedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
  });

  it('canonicalizes managed wildcard Tuturuuu http returnUrl values to https', async () => {
    const managedReturnUrl = encodeURIComponent(
      'http://vc.tuturuuu.com/workspace/personal/plans'
    );
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${managedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
  });

  it('flattens tokenless managed wildcard verifier returnUrl values', async () => {
    const managedReturnUrl = encodeURIComponent(
      'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans'
    );
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${managedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
  });

  it('does not treat tuturuuu.com returnUrl values as managed from a staging host', async () => {
    const managedReturnUrl = encodeURIComponent(
      'https://vc.tuturuuu.com/workspace/personal/plans'
    );
    const response = await GET(
      new NextRequest(
        `https://web.tutur3u.com/api/auth/callback?returnUrl=${managedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).not.toContain('vc.tuturuuu.com');
  });

  it('never acts on the staging registry when the shared cookie domain is the production default', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
      'tasks:https://tasks.tutur3u.com'
    );
    const satelliteReturnUrl = encodeURIComponent(
      'https://tasks.tutur3u.com/personal'
    );
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${satelliteReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/personal'
    );
  });

  it('routes registered staging satellites through login confirmation for the token handoff', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS',
      'tasks:https://tasks.tutur3u.com'
    );
    const satelliteReturnUrl = encodeURIComponent(
      'https://tasks.tutur3u.com/personal'
    );
    const response = await GET(
      new NextRequest(
        `https://web.tutur3u.com/api/auth/callback?returnUrl=${satelliteReturnUrl}`
      )
    );
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tasks.tutur3u.com/personal'
    );
  });

  it('rejects a managed legacy staging redirect from the new issuer', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );
    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
    const managedReturnUrl = encodeURIComponent(
      'https://preview.staging.tutur3u.com/workspace/personal/plans'
    );
    const response = await GET(
      new NextRequest(
        `https://web.tutur3u.com/api/auth/callback?returnUrl=${managedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://web.tutur3u.com/personal'
    );
  });

  it('rejects managed wildcard hostname lookalike returnUrl values', async () => {
    const managedLookalikeReturnUrl = encodeURIComponent(
      'https://vc.tuturuuu.com.evil.test/workspace/personal/plans'
    );
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${managedLookalikeReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/personal'
    );
  });

  it('does not preserve wildcard listener origins in external app return redirects', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    const externalReturnUrl = encodeURIComponent('https://cms.tuturuuu.com');
    const response = await GET(
      new NextRequest(
        `http://0.0.0.0:7803/api/auth/callback?returnUrl=${externalReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/login?returnUrl=https%3A%2F%2Fcms.tuturuuu.com'
    );
    expect(response.headers.get('location')).not.toContain('0.0.0.0');
  });

  it('does not preserve wildcard listener origins in auth-failed redirects', async () => {
    vi.stubEnv('PORT', '7803');
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockRejectedValue(new Error('exchange failed')),
      },
    });

    const response = await GET(
      new NextRequest('http://0.0.0.0:7803/api/auth/callback?code=oauth-code')
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('http://localhost:7803');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('auth_failed');
    expect(location.searchParams.get('diagnosticCode')).toMatch(
      /^AUTH-OAUTH-[A-F0-9]{6}$/
    );
    expect(location.toString()).not.toContain('0.0.0.0');
  });

  it('preserves a managed platform origin for social OAuth callback failures', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi
          .fn()
          .mockRejectedValue(new Error('exchange failed')),
      },
    });

    const response = await GET(
      new NextRequest(
        'https://vercel.tuturuuu.com/api/auth/callback?code=oauth-code'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://vercel.tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('auth_failed');
  });

  it('preserves a managed platform origin for default callback redirects', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    const response = await GET(
      new NextRequest(
        'https://vercel.tuturuuu.com/api/auth/callback?code=oauth-code&nextUrl=mail'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://vercel.tuturuuu.com');
    expect(location.pathname).toBe('/mail');
  });

  it('ignores forwarded host headers when building callback redirects', async () => {
    const response = await GET(
      new NextRequest('https://tuturuuu.com/api/auth/callback?nextUrl=mail', {
        headers: {
          'x-forwarded-host': 'evil.test',
          'x-forwarded-proto': 'https',
        },
      })
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/mail');
  });

  it('allows the root platform returnUrl when supplied over http and redirects to https', async () => {
    const returnUrl = encodeURIComponent('http://tuturuuu.com/mail?tab=inbox');
    const response = await GET(
      new NextRequest(
        `http://tuturuuu.com/api/auth/callback?returnUrl=${returnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/mail?tab=inbox'
    );
  });

  it('routes multi-account callbacks through add-account with a safe returnUrl', async () => {
    const returnUrl = encodeURIComponent('/en/personal/tasks?view=board');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?code=oauth-code&multiAccount=true&returnUrl=${returnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/add-account?returnUrl=%2Fen%2Fpersonal%2Ftasks%3Fview%3Dboard'
    );
  });

  it('preserves a configured local Portless port for multi-account callbacks when the request origin lacks it', async () => {
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('PORTLESS_PORT', '1355');
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.localhost');

    const response = await GET(
      new NextRequest(
        'https://tuturuuu.localhost/api/auth/callback?code=oauth-code&multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks',
        {
          headers: {
            'x-forwarded-host': 'tuturuuu.localhost',
            'x-forwarded-proto': 'https',
          },
        }
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.localhost:1355');
    expect(location.pathname).toBe('/add-account');
    expect(location.searchParams.get('returnUrl')).toBe('/en/personal/tasks');
  });

  it('normalizes the reported verification returnUrl on the public platform origin', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    const returnUrl = encodeURIComponent(
      'https://tuturuuu.com/verify-token?nextUrl=/onboarding'
    );
    const response = await GET(
      new NextRequest(
        `http://0.0.0.0:7803/api/auth/callback?returnUrl=${returnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/personal'
    );
    expect(response.headers.get('location')).not.toContain('0.0.0.0');
  });
});
