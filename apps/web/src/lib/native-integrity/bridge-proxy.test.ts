// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  auth: vi.fn(),
  locale: vi.fn(),
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => mocks.auth,
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/auth/cli-session', () => ({
  verifyCliAccessToken: () => ({ ok: false }),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasSupabaseSessionCookie: () => false,
  isTrustedProxyBypassRequest: () => false,
}));
vi.mock('@tuturuuu/utils/required-mfa-api-session', () => ({
  guardBrowserApiSession: async (
    _request: NextRequest,
    guard: () => Promise<NextResponse | null>
  ) => (await guard()) ?? NextResponse.next(),
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  getMalformedSupabaseAuthCookieNames: () => [],
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    throw new Error('not configured');
  },
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  extractIPFromRequest: () => '192.0.2.1',
  isIPBlockedEdge: async () => null,
  recordMalformedAuthCookieEdge: async () => null,
  recordSuspiciousApiRequestEdge: async () => null,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: async () => false,
  isWorkspaceUuidLiteral: () => false,
  normalizeWorkspaceId: async (id: string) => id,
  verifyWorkspaceMembershipType: async () => ({ ok: false }),
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getUserDefaultWorkspace: async () => null,
}));
vi.mock('@tuturuuu/utils/email/client', () => ({
  isExactTuturuuuDotComEmail: () => false,
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  hasPendingWorkspaceInvitations: async () => false,
  listPendingWorkspaceInvitations: async () => [],
}));
vi.mock('@/lib/api-cost-guard', () => ({ guardApiCost: async () => null }));
vi.mock('@/lib/locale-proxy', () => ({ handleLocale: mocks.locale }));

import { proxy } from '@/proxy';

const request = () =>
  new NextRequest(
    `https://tuturuuu.com/native-integrity/turnstile?requestHash=${'h'.repeat(43)}`,
    { headers: { 'user-agent': 'Mozilla/5.0' } }
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.auth.mockResolvedValue(NextResponse.next());
});
it('keeps the bridge public without bypassing the shared IP and quota guard', async () => {
  const response = await proxy(request());
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(mocks.guard).toHaveBeenCalledExactlyOnceWith(
    expect.any(NextRequest),
    expect.objectContaining({
      prefixBase: 'proxy:web:native-integrity-bridge',
      diagnosticPolicyName: 'native-integrity-bridge',
      routePolicies: [],
      useVerifiedBearerActor: true,
    })
  );
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.locale).not.toHaveBeenCalled();
});
it('returns bridge IP and rate-limit rejection without staff/debug continuation', async () => {
  const rejected = NextResponse.json(
    {},
    { status: 429, headers: { 'X-RateLimit-Policy': 'proxy-ip-block' } }
  );
  mocks.guard.mockResolvedValue(rejected);
  expect(await proxy(request())).toBe(rejected);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.locale).not.toHaveBeenCalled();
});
