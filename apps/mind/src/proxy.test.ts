import {
  consumeVerifyTokenRequest,
  refreshAppSessionForRequest,
} from '@tuturuuu/auth/proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  consumeVerifyTokenRequest: vi.fn(),
  propagateAuthCookies: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

vi.mock('next-intl/routing', () => ({
  defineRouting: (config: unknown) => config,
}));

vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({
    Link: 'a',
    redirect: () => undefined,
    usePathname: () => '/',
    useRouter: () => ({}),
  }),
}));

describe('Mind proxy verify-token handoff', () => {
  beforeEach(() => {
    vi.mocked(guardApiProxyRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockReset();
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValue(null);
    vi.mocked(refreshAppSessionForRequest).mockReset();
  });

  it('consumes verify-token requests before public verifier rendering', async () => {
    const verifyResponse = NextResponse.redirect(
      'https://mind.tuturuuu.com/dashboard'
    );
    vi.mocked(consumeVerifyTokenRequest).mockResolvedValueOnce(verifyResponse);
    const request = new NextRequest(
      'https://mind.tuturuuu.com/verify-token?token=copy-token&nextUrl=%2Fdashboard'
    );

    const response = await proxy(request);

    expect(response).toBe(verifyResponse);
    expect(consumeVerifyTokenRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ locales: expect.any(Array) })
    );
    expect(refreshAppSessionForRequest).not.toHaveBeenCalled();
    expect(guardApiProxyRequest).not.toHaveBeenCalled();
  });
});
