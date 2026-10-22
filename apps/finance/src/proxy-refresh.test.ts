import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), guard: vi.fn() }));
vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual('../../../packages/auth/src/proxy/mfa-failure')),
  refreshAppSessionForRequest: mocks.refresh,
  createCentralizedAuthProxy: () => async () => NextResponse.next(),
  consumeVerifyTokenRequest: async () => null,
  getRequestHeadersWithResponseCookies: vi.fn(),
  propagateAuthCookies: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
  hasAuthenticatedBearerToken: () => false,
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL_SKEW_PROTECTION_ENABLED', '1');
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_fixture');
  mocks.guard.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

function request() {
  return new NextRequest(
    'https://finance.example.test/api/v1/workspaces/id/finance/invoices',
    {
      headers: { cookie: 'tuturuuu_app_session_refresh=fixture-refresh' },
    }
  );
}

describe('Finance API terminal refresh responses', () => {
  it('keeps outage responses cookie-free with deployment skew protection enabled', async () => {
    const req = request();
    expect(req.cookies.has('__vdpl')).toBe(false);
    const downstream = new Response(null, {
      status: 503,
      headers: { 'set-cookie': 'ignored=fixture; Path=/' },
    });
    mocks.refresh.mockResolvedValue({
      ok: false,
      error: 'App session refresh unavailable',
      response: downstream,
    });
    const response = await proxy(req);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'APP_SESSION_REFRESH_UNAVAILABLE',
      error: 'App session refresh temporarily unavailable',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.guard).not.toHaveBeenCalled();
  });

  it('pins a healthy API continuation to the current deployment', async () => {
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    const response = await proxy(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.cookies.get('__vdpl')?.value).toBe('dpl_fixture');
    expect(mocks.guard).toHaveBeenCalledOnce();
  });
});
