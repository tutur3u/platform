import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { NextRequest } from 'next/server';
import { expect, it, type Mock, vi } from 'vitest';

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

  const UPSKII_BASIC = `Basic ${btoa('upskii:fake-test-secret')}`;

  it.each([
    '/api/v1/integrations/upskii/introspect',
    '/api/v1/integrations/upskii/link-status',
    '/api/v1/integrations/upskii/unlink',
  ])(
    'lets Upskii Basic credentials reach the guard on POST %s, without a UA and uncounted',
    async (path) => {
      const { proxy } = await import('../proxy');
      const headerSets: Record<string, string>[] = [
        { Authorization: UPSKII_BASIC, 'content-type': 'application/json' },
        {
          Authorization: UPSKII_BASIC,
          'content-type': 'application/json',
          'user-agent': 'upskii-server/1.0',
        },
      ];
      for (const headers of headerSets) {
        mocks.guardApiProxyRequest.mockClear();
        const response = await proxy(
          new NextRequest(`http://localhost${path}`, {
            body: '{}',
            headers,
            method: 'POST',
          })
        );

        expect(response.headers.get('X-Proxy-Block-Reason')).toBeNull();
        expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
      }
      expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['GET', '/api/v1/integrations/upskii/link-status'],
    ['PUT', '/api/v1/integrations/upskii/unlink'],
    ['HEAD', '/api/v1/integrations/upskii/introspect'],
    ['POST', '/api/v1/integrations/UPSKII/unlink'],
    ['POST', '/api/v1/integrations/upskii/link'],
    ['POST', '/api/v1/integrations/upskii/link-status/'],
    ['POST', '/api/v1/integrations/upskii/introspect/extra'],
    ['POST', '/api/v1/integrations/upskii%2Funlink'],
    ['POST', '/api/v1/integrations/upskiiintrospect'],
    ['POST', '/api/v1/users/me/configs/demo'],
  ])('keeps Basic credentials malformed for %s %s', async (method, path) => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(`http://localhost${path}`, {
        ...(method === 'GET' || method === 'HEAD' ? {} : { body: '{}' }),
        headers: { Authorization: UPSKII_BASIC, 'user-agent': 'curl/8.0' },
        method,
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'malformed-auth-header'
    );
    expect(mocks.recordSuspiciousApiRequestEdge).toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps a non-Basic or empty scheme malformed on the Upskii paths', async () => {
    const { proxy } = await import('../proxy');
    for (const authorization of ['Basic ', 'Basic a b', 'Token abc']) {
      const response = await proxy(
        new NextRequest('http://localhost/api/v1/integrations/upskii/unlink', {
          body: '{}',
          headers: { Authorization: authorization, 'user-agent': 'curl/8.0' },
          method: 'POST',
        })
      );
      expect(response.status).toBe(401);
    }
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('lets a JSON app-token exchange through without a UA', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/auth/app-token/exchange', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.headers.get('X-Proxy-Block-Reason')).toBeNull();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledOnce();
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/api/v1/auth/app-token/exchange', undefined],
    ['POST', '/api/v1/auth/app-token/exchange', 'text/plain'],
    ['POST', '/api/v1/auth/app-token/exchange/x', 'application/json'],
    ['POST', '/api/v1/users/me/configs/demo', 'application/json'],
  ])(
    'still refuses a UA-less %s %s (%s)',
    async (method, path, contentType) => {
      const { proxy } = await import('../proxy');
      const response = await proxy(
        new NextRequest(`http://localhost${path}`, {
          ...(method === 'GET' ? {} : { body: '{}' }),
          headers: contentType ? { 'content-type': contentType } : {},
          method,
        })
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
        'suspicious-anonymous-request'
      );
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['test-secret', true],
    ['forged-secret', false],
  ])(
    'treats a UA-less ttr_app_ bearer signed with %s as server-to-server: %s',
    async (secret, admitted) => {
      vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
      try {
        const { token } = createAppCoordinationToken(
          {
            expiresInSeconds: 300,
            originApp: 'web',
            scopes: ['upskii-link:write'],
            targetApp: 'upskii',
            userId: '11111111-1111-4111-8111-111111111111',
          },
          { secret }
        );
        const { proxy } = await import('../proxy');
        const response = await proxy(
          new NextRequest('http://localhost/api/v1/integrations/upskii/link', {
            body: '{}',
            headers: { Authorization: `Bearer ${token}` },
            method: 'POST',
          })
        );

        expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
          admitted ? null : 'suspicious-anonymous-request'
        );
        expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(
          admitted ? 1 : 0
        );
        expect(mocks.recordSuspiciousApiRequestEdge).toHaveBeenCalledTimes(
          admitted ? 0 : 1
        );
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
}
