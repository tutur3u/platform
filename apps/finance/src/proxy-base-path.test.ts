import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ personal: vi.fn(), workspace: vi.fn() }));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => true,
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => async () => NextResponse.next(),
  consumeVerifyTokenRequest: async () => null,
  getRequestHeadersWithResponseCookies: (request: NextRequest) =>
    request.headers,
  propagateAuthCookies: (_source: unknown, response: NextResponse) => {
    response.headers.append('set-cookie', 'fixture=kept; Path=/');
  },
  appSessionFailureResponse: vi.fn(),
  preserveMfaRecoveryCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: mocks.workspace,
  withForwardedInternalApiAuth: (headers: Headers) => headers,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: mocks.personal,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { proxy } from './proxy';

const workspaceId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.personal.mockResolvedValue(false);
  mocks.workspace.mockResolvedValue(null);
});

describe.each(['', '/finance'])('Finance redirect base %s', (basePath) => {
  it.each([
    {
      path: `/vi/${ROOT_WORKSPACE_ID}/wallets`,
      target: '/vi/internal/wallets',
      personal: false,
    },
    {
      path: `/vi/${workspaceId}/transactions`,
      target: '/vi/personal/transactions',
      personal: true,
    },
    { path: '/', target: '/personal', personal: false },
    {
      path: '/',
      target: `/${workspaceId}`,
      personal: false,
      workspace: { id: workspaceId, personal: false },
    },
  ])(
    'preserves the mount, query and auth cookies for $path -> $target',
    async ({ path, target, personal, workspace }) => {
      mocks.personal.mockResolvedValue(personal);
      mocks.workspace.mockResolvedValue(workspace ?? null);
      const request = new NextRequest(
        `https://example.test${basePath}${path}?ref=a&ref=b`,
        { nextConfig: { basePath } }
      );
      const response = await proxy(request);
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        `https://example.test${basePath}${target}?ref=a&ref=b`
      );
      expect(response.headers.get('set-cookie')).toContain('fixture=kept');
    }
  );
});
