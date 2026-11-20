import { NextRequest } from 'next/server';
import { expect, it, type Mock } from 'vitest';

export function registerAnonymousApiProxyCases(mocks: {
  guardApiProxyRequest: Mock;
  recordSuspiciousApiRequestEdge: Mock;
}) {
  it('blocks malformed authorization headers before the proxy guard', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          Authorization: 'Basic totally-wrong',
          'user-agent': 'curl/8.0',
        },
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'malformed-auth-header'
    );
    expect(mocks.recordSuspiciousApiRequestEdge).toHaveBeenCalledWith(
      '203.0.113.10'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it.each([
    [400, new Headers()],
    [200, new Headers({ 'user-agent': 'Mozilla/5.0' })],
  ])(
    'checks suspicious traffic before versioned asset delivery (status %i)',
    async (status, headers) => {
      const { proxy } = await import('../proxy');
      const response = await proxy(
        new NextRequest(
          'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/a1709d63-f798-4088-9c77-8a689026d66d?v=1',
          { headers }
        )
      );

      expect(response.status).toBe(status);
      expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
        status === 400 ? 'suspicious-anonymous-request' : null
      );
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it('keeps forged bearer tokens inside suspicious anonymous API checks', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer aaa.bbb.ccc',
        },
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'suspicious-anonymous-request'
    );
    expect(mocks.recordSuspiciousApiRequestEdge).toHaveBeenCalledWith(
      '203.0.113.10'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('escalates repeated suspicious anonymous API traffic into an IP block', async () => {
    const now = new Date(Date.now());

    mocks.recordSuspiciousApiRequestEdge.mockResolvedValue({
      id: 'block-2',
      blockLevel: 1,
      reason: 'api_abuse',
      blockedAt: now,
      expiresAt: new Date(Date.now() + 300_000),
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(response.headers.get('X-RateLimit-Client-IP')).toBe('203.0.113.10');
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });
}
