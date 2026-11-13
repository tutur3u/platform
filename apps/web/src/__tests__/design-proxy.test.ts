import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE_HEADER } from './required-mfa-proxy-fixture';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  createCentralizedAuthProxy: vi.fn(),
  verifyCliAccessToken: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasSupabaseSessionCookie: vi.fn(),
  isTrustedProxyBypassRequest: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getMalformedSupabaseAuthCookieNames: vi.fn(),
  extractIPFromRequest: vi.fn(),
  isIPBlockedEdge: vi.fn(),
  recordMalformedAuthCookieEdge: vi.fn(),
  recordSuspiciousApiRequestEdge: vi.fn(),
  isPersonalWorkspace: vi.fn(),
  isWorkspaceUuidLiteral: vi.fn((value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  ),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getUserDefaultWorkspace: vi.fn(),
  hasPendingWorkspaceInvitations: vi.fn(),
  listPendingWorkspaceInvitations: vi.fn(),
  isExactTuturuuuDotComEmail: vi.fn(),
}));
vi.mock('@/lib/api-cost-guard', () => ({
  guardApiCost: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: (
    ...args: Parameters<typeof mocks.createCentralizedAuthProxy>
  ) => mocks.createCentralizedAuthProxy(...args),
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: (
    ...args: Parameters<typeof mocks.verifyCliAccessToken>
  ) => mocks.verifyCliAccessToken(...args),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasSupabaseSessionCookie: (
    ...args: Parameters<typeof mocks.hasSupabaseSessionCookie>
  ) => mocks.hasSupabaseSessionCookie(...args),
  isTrustedProxyBypassForRequest: (req: NextRequest) =>
    mocks.isTrustedProxyBypassRequest(req.nextUrl.pathname, req.headers),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  getMalformedSupabaseAuthCookieNames: (
    ...args: Parameters<typeof mocks.getMalformedSupabaseAuthCookieNames>
  ) => mocks.getMalformedSupabaseAuthCookieNames(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: (
    ...args: Parameters<typeof mocks.extractIPFromRequest>
  ) => mocks.extractIPFromRequest(...args),
  isIPBlockedEdge: (...args: Parameters<typeof mocks.isIPBlockedEdge>) =>
    mocks.isIPBlockedEdge(...args),
  recordMalformedAuthCookieEdge: (
    ...args: Parameters<typeof mocks.recordMalformedAuthCookieEdge>
  ) => mocks.recordMalformedAuthCookieEdge(...args),
  recordSuspiciousApiRequestEdge: (
    ...args: Parameters<typeof mocks.recordSuspiciousApiRequestEdge>
  ) => mocks.recordSuspiciousApiRequestEdge(...args),
  blockIPEdge: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isWorkspaceUuidLiteral: (
    ...args: Parameters<typeof mocks.isWorkspaceUuidLiteral>
  ) => mocks.isWorkspaceUuidLiteral(...args),
  isPersonalWorkspace: (
    ...args: Parameters<typeof mocks.isPersonalWorkspace>
  ) => mocks.isPersonalWorkspace(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getUserDefaultWorkspace>
  ) => mocks.getUserDefaultWorkspace(...args),
}));

vi.mock('../lib/workspace-invitations/status', () => ({
  hasPendingWorkspaceInvitations: (
    ...args: Parameters<typeof mocks.hasPendingWorkspaceInvitations>
  ) => mocks.hasPendingWorkspaceInvitations(...args),
  listPendingWorkspaceInvitations: (
    ...args: Parameters<typeof mocks.listPendingWorkspaceInvitations>
  ) => mocks.listPendingWorkspaceInvitations(...args),
}));

vi.mock('@tuturuuu/utils/email/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/email/client')>()),
  isExactTuturuuuDotComEmail: (
    ...args: Parameters<typeof mocks.isExactTuturuuuDotComEmail>
  ) => mocks.isExactTuturuuuDotComEmail(...args),
}));

describe('web proxy api handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.createCentralizedAuthProxy.mockReturnValue(mocks.authProxy);
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupabaseSessionCookie.mockImplementation((req: NextRequest) => {
      return req.cookies
        .getAll()
        .some(
          (cookie) =>
            cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')
        );
    });
    mocks.createAdminClient.mockRejectedValue(new Error('not configured'));
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([]);
    mocks.extractIPFromRequest.mockReturnValue('203.0.113.10');
    mocks.isIPBlockedEdge.mockResolvedValue(null);
    mocks.recordMalformedAuthCookieEdge.mockResolvedValue(null);
    mocks.recordSuspiciousApiRequestEdge.mockResolvedValue(null);
    mocks.isTrustedProxyBypassRequest.mockReturnValue(false);
    mocks.verifyCliAccessToken.mockReturnValue({
      error: 'invalid token',
      ok: false,
    });
    mocks.isExactTuturuuuDotComEmail.mockReturnValue(false);
    mocks.isPersonalWorkspace.mockResolvedValue(false);
    mocks.normalizeWorkspaceId.mockImplementation(async (wsId: string) => wsId);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getUserDefaultWorkspace.mockResolvedValue(null);
    mocks.hasPendingWorkspaceInvitations.mockResolvedValue(false);
    mocks.listPendingWorkspaceInvitations.mockResolvedValue([]);
  });

  function createSessionRequest(url: string) {
    return new NextRequest(url, {
      headers: {
        cookie: AUTH_COOKIE_HEADER,
      },
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects legacy ui routes to design before auth', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(
        'http://localhost/vi/ui/components/button?view=docs#usage'
      )
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'http://localhost/vi/design/components/button?view=docs'
    );
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('serves anonymous design documents from the public cache', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/design/components/button')
    );

    expect(response.status).not.toBe(301);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    );
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
  });

  it('keeps a signed-in design document out of the shared cache', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      createSessionRequest('http://localhost/en/design')
    );

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cdn-cache-control')).toBeNull();
  });

  it('authorizes design by segment and leaves the neighbouring path private', async () => {
    const { proxy } = await import('../proxy');
    await proxy(new NextRequest('http://localhost/design'));

    const authOptions = mocks.createCentralizedAuthProxy.mock.calls[0]?.[0] as
      | {
          isPublicPath?: (pathname: string) => boolean;
          publicPaths?: string[];
        }
      | undefined;

    expect(authOptions?.isPublicPath?.('/design')).toBe(true);
    expect(authOptions?.isPublicPath?.('/design/components/button')).toBe(true);
    expect(authOptions?.isPublicPath?.('/en/design/setup')).toBe(true);
    expect(authOptions?.isPublicPath?.('/vi/design')).toBe(true);
    expect(authOptions?.isPublicPath?.('/design-private')).toBe(false);
    expect(authOptions?.isPublicPath?.('/en/design-private')).toBe(false);
    expect(authOptions?.publicPaths).not.toEqual(
      expect.arrayContaining(['/design', '/en/design', '/vi/design'])
    );
  });
});
