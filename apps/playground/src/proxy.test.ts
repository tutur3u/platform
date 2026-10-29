import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardApiProxyRequest = vi.fn();

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (...args: unknown[]) => guardApiProxyRequest(...args),
}));

const { config, proxy } = await import('./proxy');

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(
    new URL(path, 'https://playground.contract.test'),
    init
  );
}

describe('playground proxy contract', () => {
  beforeEach(() => {
    guardApiProxyRequest.mockReset();
  });

  it('runs only for /api paths', () => {
    expect(config).toEqual({ matcher: ['/api/:path*'] });
  });

  it('guards local and proxied API requests with the playground bucket prefix', async () => {
    guardApiProxyRequest.mockResolvedValue(null);

    for (const path of [
      '/api/ai/object-generation',
      '/api/build-info',
      '/api/v1/users/me',
    ]) {
      const req = request(path);
      const res = await proxy(req);

      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(guardApiProxyRequest).toHaveBeenLastCalledWith(req, {
        prefixBase: 'proxy:playground:api',
      });
    }
    expect(guardApiProxyRequest).toHaveBeenCalledTimes(3);
  });

  it('returns the guard rejection unchanged', async () => {
    const rejection = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
    guardApiProxyRequest.mockResolvedValue(rejection);

    const res = await proxy(
      request('/api/ai/object-generation', { method: 'POST' })
    );

    expect(res).toBe(rejection);
    expect(res.status).toBe(429);
  });

  it('does not guard non-API paths even if invoked directly', async () => {
    const res = await proxy(request('/tool-calling'));

    expect(guardApiProxyRequest).not.toHaveBeenCalled();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('propagates guard failures instead of failing open', async () => {
    guardApiProxyRequest.mockRejectedValue(new Error('guard unavailable'));

    await expect(proxy(request('/api/build-info'))).rejects.toThrow(
      'guard unavailable'
    );
  });
});
