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

  it.each([
    'https://rewise.me/workspace/personal',
    'https://www.rewise.me',
    'https://rewise.school/workspace/personal',
    'https://app.rewise.school',
  ])('rejects released Rewise domain returnUrl %s', async (returnUrl) => {
    const response = await GET(
      new NextRequest(
        `https://tuturuuu.com/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/personal'
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

  describe('returnUrl decoding', () => {
    const nestedQuery = 'q=a%26b%3Fc%25d%2Be';

    async function redirectFor(callbackUrl: string) {
      const response = await GET(new NextRequest(callbackUrl));
      return response.headers.get('location');
    }

    it('preserves escaped characters in a managed returnUrl nested query', async () => {
      const returnUrl = `https://vc.tuturuuu.com/workspace/search?${nestedQuery}`;

      await expect(
        redirectFor(
          `https://tuturuuu.com/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        )
      ).resolves.toBe(returnUrl);
    });

    it('keeps an escaped nested verifier destination intact', async () => {
      const returnUrl =
        'https://vc.tuturuuu.com/verify-token?nextUrl=%2Finbox%3Fq%3Da%2526b';

      await expect(
        redirectFor(
          `https://tuturuuu.com/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        )
      ).resolves.toBe('https://vc.tuturuuu.com/inbox?q=a%26b');
    });

    it('preserves escaped characters in a trusted external returnUrl', async () => {
      const returnUrl = `https://cms.tuturuuu.com/search?${nestedQuery}`;
      const location = new URL(
        (await redirectFor(
          `http://localhost/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        )) ?? ''
      );

      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('returnUrl')).toBe(returnUrl);
    });

    it('preserves a relative returnUrl with a nested query', async () => {
      const returnUrl = `/workspace/search?${nestedQuery}`;

      await expect(
        redirectFor(
          `http://localhost/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        )
      ).resolves.toBe(`http://localhost${returnUrl}`);
    });

    it('preserves a nested query through the multi-account callback', async () => {
      const returnUrl = `/workspace/search?${nestedQuery}`;
      const location = new URL(
        (await redirectFor(
          `http://localhost/api/auth/callback?code=oauth-code&multiAccount=true&returnUrl=${encodeURIComponent(returnUrl)}`
        )) ?? ''
      );

      expect(location.pathname).toBe('/add-account');
      expect(location.searchParams.get('returnUrl')).toBe(returnUrl);
    });

    it('keeps a lone percent sign instead of falling back to the default', async () => {
      await expect(
        redirectFor(
          `http://localhost/api/auth/callback?returnUrl=${encodeURIComponent('/search?q=100%')}`
        )
      ).resolves.toBe('http://localhost/search?q=100%');
    });

    it.each([
      [
        'absolute',
        'https://vc.tuturuuu.com/workspace/personal/plans',
        'https://tuturuuu.com',
        'https://vc.tuturuuu.com/workspace/personal/plans',
      ],
      [
        'relative',
        '/en/personal/tasks?view=board',
        'http://localhost',
        'http://localhost/en/personal/tasks?view=board',
      ],
    ])(
      'decodes a legacy fully encoded %s returnUrl once',
      async (_kind, target, origin, expected) => {
        const legacyReturnUrl = encodeURIComponent(encodeURIComponent(target));

        await expect(
          redirectFor(
            `${origin}/api/auth/callback?returnUrl=${legacyReturnUrl}`
          )
        ).resolves.toBe(expected);
      }
    );

    it.each([
      '//evil.test/x',
      '%2F%2Fevil.test%2Fx',
      '/%2F%2Fevil.test',
      '/\\evil.test',
      '%2F%5Cevil.test',
      '\\\\evil.test',
      '%5C%5Cevil.test',
      'javascript:alert(1)',
      'javascript%3Aalert(1)',
      'JAVASCRIPT%3Aalert%281%29',
      'data:text/html,evil',
      'https://evil.test',
      'https%3A%2F%2Fevil.test',
      'HTTPS%3A%2F%2Fevil.test',
      'https%3A//evil.test',
      'https%253A%252F%252Fevil.test',
      'https%3A%2F%2Fcms.tuturuuu.com.evil.test',
      'https://evil.test/?returnUrl=%2Fpersonal',
    ])('rejects malicious returnUrl %s', async (returnUrl) => {
      const location = new URL(
        (await redirectFor(
          `http://localhost/api/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`
        )) ?? ''
      );

      expect(location.origin).toBe('http://localhost');
      expect(location.pathname).not.toMatch(/evil/i);
      expect(location.searchParams.get('returnUrl') ?? '').not.toMatch(/evil/i);
    });
  });
});
