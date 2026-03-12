import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => mocks.authProxy,
  propagateAuthCookies: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(),
}));

describe('web proxy api handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authProxy.mockReset();
    mocks.guardApiProxyRequest.mockReset();
  });

  it('returns proxy guard responses for API requests before auth', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response).toBe(guardResponse);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { prefixBase: 'proxy:web:api' }
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('passes clean API requests through without invoking auth flow', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });
});
