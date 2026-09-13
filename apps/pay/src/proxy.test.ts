import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), guard: vi.fn() }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: unknown, response: unknown) => response,
  getAppSessionClaimsFromRequest: vi.fn(),
  hasSupportedSupabaseAuthCookie: vi.fn(),
  hasWebAppSessionTokenFromRequest: vi.fn(),
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: mocks.refresh,
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: mocks.guard,
}));
vi.mock('@tuturuuu/utils/shared-cookie', () => ({
  getTuturuuuSharedCookieOptions: vi.fn(),
}));
vi.mock('next-intl/middleware', () => ({ default: () => vi.fn() }));

import { proxy } from './proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ ok: false });
  mocks.guard.mockResolvedValue(null);
});
describe('Pay machine-authenticated endpoints', () => {
  it.each([
    ['POST', '/api/payment/webhooks'],
    ['GET', '/api/cron/payment/products'],
    ['GET', '/api/cron/payment/subscriptions'],
  ])(
    'allows %s %s to reach its signature or bearer validator',
    async (method, path) => {
      const response = await proxy(
        new NextRequest(`https://pay.tuturuuu.com${path}`, { method })
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.guard).toHaveBeenCalledOnce();
    }
  );
  it.each([
    ['GET', '/api/payment/webhooks'],
    ['POST', '/api/payment/webhooks/other'],
    ['POST', '/api/payment/seats'],
    ['POST', '/api/cron/payment/products'],
    ['GET', '/api/cron/payment/other'],
  ])('does not exempt %s %s from session checks', async (method, path) => {
    const response = await proxy(
      new NextRequest(`https://pay.tuturuuu.com${path}`, { method })
    );
    expect(response.status).toBe(401);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('retains edge protection for machine endpoints', async () => {
    mocks.guard.mockResolvedValue(
      NextResponse.json({ error: 'Blocked' }, { status: 429 })
    );
    const response = await proxy(
      new NextRequest('https://pay.tuturuuu.com/api/payment/webhooks', {
        method: 'POST',
      })
    );
    expect(response.status).toBe(429);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
