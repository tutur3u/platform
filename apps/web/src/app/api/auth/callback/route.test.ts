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
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      'https://tuturuuu.com/onboarding'
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
      'https://tuturuuu.com/onboarding'
    );
    expect(response.headers.get('location')).not.toContain('0.0.0.0');
  });
});
