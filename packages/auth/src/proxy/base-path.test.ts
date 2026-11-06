import './required-mfa-test-fixture';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeVerifyTokenRequest, createCentralizedAuthProxy } from './index';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: (...args: Parameters<typeof mocks.updateSession>) =>
    mocks.updateSession(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

/** A request to an app mounted at `tuturuuu.com/tasks` (Next basePath). */
const mounted = (path: string) =>
  new NextRequest(`https://tuturuuu.com/tasks${path}`, {
    nextConfig: { basePath: '/tasks' },
  });

describe('auth proxy under a Next basePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('PORT', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    mocks.updateSession.mockResolvedValue({
      claims: null,
      res: NextResponse.next(),
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { totp: [] } }),
        },
      },
    });
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
  });

  it('returns unauthenticated users to the mounted verify-token page', async () => {
    const authProxy = createCentralizedAuthProxy({
      skipApiRoutes: true,
      webAppUrl: 'https://tuturuuu.com',
    });

    const response = await authProxy(mounted('/en/personal/boards?view=list'));
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.origin + location.pathname).toBe(
      'https://tuturuuu.com/login'
    );
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://tuturuuu.com/tasks/verify-token?nextUrl=%2Fen%2Fpersonal%2Fboards%3Fview%3Dlist'
    );
  });

  it('redirects a tokenless verify-token request inside the mount', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await consumeVerifyTokenRequest(
      mounted('/verify-token?nextUrl=%2Fpersonal%3Fview%3Dweek')
    );

    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/personal?view=week'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unsafe nextUrl fallbacks inside the mount', async () => {
    const response = await consumeVerifyTokenRequest(
      mounted('/verify-token?nextUrl=https%3A%2F%2Fevil.test'),
      { fallbackPath: '/fallback' }
    );

    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/fallback'
    );
  });

  it('does not prefix a nextUrl that already carries the base', async () => {
    const response = await consumeVerifyTokenRequest(
      mounted('/verify-token?nextUrl=%2Ftasks%2Fpersonal')
    );

    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/personal'
    );
  });

  it("posts the token to the mounted app's verifier, not the apex API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          appSessionCreated: true,
          userId: 'user-1',
          valid: true,
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await consumeVerifyTokenRequest(
      mounted('/verify-token?token=copy-token&nextUrl=%2Fpersonal')
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://tuturuuu.com/tasks/api/auth/verify-app-token'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(response?.headers.get('location')).toBe(
      'https://tuturuuu.com/tasks/personal'
    );
  });
});
