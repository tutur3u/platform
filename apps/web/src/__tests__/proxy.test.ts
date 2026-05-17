import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  guardApiProxyRequest: vi.fn(),
  hasAuthenticatedApiSession: vi.fn(),
  isTrustedProxyBypassRequest: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getMalformedSupabaseAuthCookieNames: vi.fn(),
  extractIPFromRequest: vi.fn(),
  isIPBlockedEdge: vi.fn(),
  recordMalformedAuthCookieEdge: vi.fn(),
  recordSuspiciousApiRequestEdge: vi.fn(),
  isPersonalWorkspace: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getUserDefaultWorkspace: vi.fn(),
}));

vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => mocks.authProxy,
  propagateAuthCookies: vi.fn(),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (
    ...args: Parameters<typeof mocks.guardApiProxyRequest>
  ) => mocks.guardApiProxyRequest(...args),
  hasAuthenticatedApiSession: (
    ...args: Parameters<typeof mocks.hasAuthenticatedApiSession>
  ) => mocks.hasAuthenticatedApiSession(...args),
  isTrustedProxyBypassRequest: (
    ...args: Parameters<typeof mocks.isTrustedProxyBypassRequest>
  ) => mocks.isTrustedProxyBypassRequest(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
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

describe('web proxy api handling', () => {
  function createAuthenticatedSupabaseClient() {
    const completedOnboardingBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          completed_at: new Date().toISOString(),
          profile_completed: true,
        },
        error: null,
      }),
    };
    const emptyMaybeSingleBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    return {
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn((table: string) =>
        table === 'onboarding_progress'
          ? completedOnboardingBuilder
          : emptyMaybeSingleBuilder
      ),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authProxy.mockResolvedValue(NextResponse.next());
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasAuthenticatedApiSession.mockImplementation((req: NextRequest) => {
      const authHeader = req.headers.get('authorization')?.trim() ?? '';
      if (
        authHeader === 'ttr_test_key' ||
        authHeader.startsWith('Bearer ') ||
        authHeader.startsWith('bearer ')
      ) {
        return true;
      }

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
    mocks.isPersonalWorkspace.mockResolvedValue(false);
    mocks.normalizeWorkspaceId.mockImplementation(async (wsId: string) => wsId);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getUserDefaultWorkspace.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
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
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      })
    );

    expect(response).toBe(guardResponse);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { prefixBase: 'proxy:web:api' }
    );
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('lets oversized API payloads reach the proxy guard so they return 413 instead of suspicious-request 400', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Payload Too Large', message: 'Request body exceeds limit' },
      { status: 413 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'PUT',
        headers: {
          'content-length': `${600 * 1024}`,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({ value: 'x'.repeat(1024) }),
      })
    );

    expect(response).toBe(guardResponse);
    expect(response.status).toBe(413);
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
  });

  it('passes clean API requests through without invoking auth flow', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('keeps signed-in browser requests out of the suspicious-anonymous gate', async () => {
    const { proxy } = await import('../proxy');
    const url = new URL(
      'http://localhost/api/v1/workspaces/ws-1/users/groups/possible-excluded'
    );
    for (let i = 0; i < 30; i += 1) {
      url.searchParams.append('includedGroups', `group-${i}`);
    }

    const response = await proxy(
      new NextRequest(url, {
        method: 'GET',
        headers: {
          cookie:
            'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
  });

  it('blocks malformed Supabase auth cookies at the API proxy layer', async () => {
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'malformed-supabase-auth-cookie'
    );
    expect(response.cookies.get('sb-test-auth-token')?.value).toBe('');
    expect(mocks.recordMalformedAuthCookieEdge).toHaveBeenCalledWith(
      '203.0.113.10'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('escalates repeated malformed-cookie traffic into an IP block', async () => {
    const now = new Date(Date.now());

    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);
    mocks.recordMalformedAuthCookieEdge.mockResolvedValue({
      id: 'block-1',
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
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('does not block bearer-token API requests with malformed browser cookies', async () => {
    mocks.getMalformedSupabaseAuthCookieNames.mockReturnValue([
      'sb-test-auth-token',
    ]);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('ignores reserved tilde workspace API segments before UUID-backed workspace checks', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/workspaces/~/mail/send', {
        method: 'POST',
        body: '{}',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

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
    expect(response.headers.get('Retry-After')).not.toBeNull();
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
  });

  it('keeps trusted bypass API routes out of the suspicious-anonymous gate', async () => {
    mocks.isTrustedProxyBypassRequest.mockReturnValue(true);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/cron/process-post-email-queue', {
        method: 'POST',
        body: '{}',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
  });

  it('lets storage unzip callbacks bypass proxy rate limiting', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(
      NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-Proxy-Block-Reason': 'route-rate-limit',
          },
        }
      )
    );

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/storage/auto-extract',
        {
          method: 'POST',
          body: '{}',
          headers: {
            Authorization: 'Bearer unzip-proxy-token',
            'content-type': 'application/json',
            'user-agent': 'Bun/1.2',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
  });

  it('escalates repeated anonymous proxy guard rate-limit hits into an IP block', async () => {
    const now = new Date(Date.now());

    mocks.guardApiProxyRequest.mockResolvedValue(
      NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-Proxy-Block-Reason': 'route-rate-limit',
          },
        }
      )
    );
    mocks.recordSuspiciousApiRequestEdge.mockResolvedValue({
      id: 'block-3',
      blockLevel: 1,
      reason: 'api_abuse',
      blockedAt: now,
      expiresAt: new Date(Date.now() + 300_000),
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/api/v1/users/me/configs/demo', {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-Proxy-Block-Reason')).toBe(
      'ip-already-blocked'
    );
    expect(mocks.recordSuspiciousApiRequestEdge).toHaveBeenCalledWith(
      '203.0.113.10'
    );
  });

  it('does not escalate signed-in browser route-rate-limit responses into an IP block', async () => {
    const guardResponse = NextResponse.json(
      { error: 'Too Many Requests', message: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-Proxy-Block-Reason': 'route-rate-limit',
        },
      }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(guardResponse);

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/database',
        {
          method: 'GET',
          headers: {
            cookie:
              'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue; theme=dark',
            'user-agent': 'Mozilla/5.0',
          },
        }
      )
    );

    expect(response).toBe(guardResponse);
    expect(mocks.recordSuspiciousApiRequestEdge).not.toHaveBeenCalled();
  });

  it('bypasses auth and locale rewriting for the offline fallback route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/~offline'));

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized offline fallback requests to the canonical route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~offline?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/~offline?retry=1'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('bypasses auth and locale rewriting for the browser-state recovery route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/~recover-browser-state')
    );

    expect(response.status).toBe(200);
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized browser-state recovery requests to the canonical route', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~recover-browser-state?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/~recover-browser-state?retry=1'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('bypasses auth and locale rewriting for reserved root tilde routes', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/~'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('rewrites dot-prefixed root segments before they can fall through to locale or workspace resolution', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/.well-known/traffic-advice')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('rewrites localized dot-prefixed workspace-like segments before they can fall through', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/.well-known/traffic-advice')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized reserved tilde routes to the canonical root path', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~unknown?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/~unknown?retry=1'
    );
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('redirects localized bare tilde routes before they can fall through to workspace resolution', async () => {
    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/en/~?retry=1')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/~?retry=1');
    expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
    expect(mocks.authProxy).not.toHaveBeenCalled();
  });

  it('falls back to the default locale when accept-language contains invalid values', async () => {
    mocks.authProxy.mockResolvedValue(NextResponse.next());

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/login', {
        headers: {
          'accept-language': '*,not-a_locale,en;q=0.8',
        },
      })
    );

    expect(response).toBeInstanceOf(NextResponse);
  });

  it('redirects root to a configured workspace board when board config is valid', async () => {
    const adminQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            value: JSON.stringify({
              target: 'tasks',
              submodule: 'boards',
              boardId: 'board-1',
            }),
          },
        })
        .mockResolvedValueOnce({ data: { id: 'board-1' }, error: null }),
    };

    const supabaseClient = createAuthenticatedSupabaseClient();

    mocks.createClient.mockResolvedValue(supabaseClient);
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(adminQueryBuilder),
    });
    mocks.getUserDefaultWorkspace.mockResolvedValue({
      id: 'ws-1',
      personal: false,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/ws-1/tasks/boards/board-1'
    );
  });

  it('applies the personal default board preference only from the root redirect', async () => {
    const workspaceConfigBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          value: JSON.stringify({
            target: 'tasks',
            submodule: 'boards',
          }),
        },
      }),
    };
    const userConfigBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { value: 'true' },
      }),
    };
    const defaultBoardBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'board-1' },
        error: null,
      }),
    };
    const adminFrom = vi.fn((table: string) => {
      if (table === 'user_workspace_configs') return workspaceConfigBuilder;
      if (table === 'user_configs') return userConfigBuilder;
      return defaultBoardBuilder;
    });

    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: adminFrom,
    });
    mocks.getUserDefaultWorkspace.mockResolvedValue({
      id: 'ws-personal',
      personal: true,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/personal/tasks/boards/board-1'
    );
    expect(adminFrom).toHaveBeenCalledWith('user_configs');
    expect(adminFrom).toHaveBeenCalledWith('workspace_boards');
  });

  it('preserves locale when redirecting root to a configured workspace board', async () => {
    const adminQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            value: JSON.stringify({
              target: 'tasks',
              submodule: 'boards',
              boardId: 'board-1',
            }),
          },
        })
        .mockResolvedValueOnce({ data: { id: 'board-1' }, error: null }),
    };

    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(adminQueryBuilder),
    });
    mocks.getUserDefaultWorkspace.mockResolvedValue({
      id: 'ws-1',
      personal: false,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/vi'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/vi/ws-1/tasks/boards/board-1'
    );
  });

  it('does not apply configured board navigation on direct personal workspace home paths', async () => {
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/personal?task=task-1')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'personal',
      expect.anything()
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getUserDefaultWorkspace).not.toHaveBeenCalled();
  });

  it('preserves direct workspace home paths instead of applying configured board navigation', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111';

    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(`http://localhost/${workspaceId}?task=task-1`)
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      workspaceId,
      expect.anything()
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('leaves non-UUID workspace home slugs on their home route', async () => {
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/team-slug?task=task-1')
    );

    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'team-slug',
      expect.anything()
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('skips workspace-home admin reads when the user is not a workspace member', async () => {
    const adminFrom = vi.fn();
    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: false,
      error: 'membership_missing',
    });
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: adminFrom,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/11111111-1111-4111-8111-111111111111')
    );

    expect(response.status).toBe(200);
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('denies guest workspace home routes before default navigation admin reads', async () => {
    const adminFrom = vi.fn();
    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: true,
      membershipType: 'GUEST',
    });
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: adminFrom,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest('http://localhost/11111111-1111-4111-8111-111111111111')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('denies guest dashboard routes without mapped permissions', async () => {
    const adminFrom = vi.fn();
    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: true,
      membershipType: 'GUEST',
    });
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: adminFrom,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(
        'http://localhost/11111111-1111-4111-8111-111111111111/unknown'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/__reserved-root-not-found__'
    );
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('allows guest dashboard routes when the mapped guest default is enabled', async () => {
    const defaultPermissionsBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    };
    defaultPermissionsBuilder.eq
      .mockReturnValueOnce(defaultPermissionsBuilder)
      .mockReturnValueOnce(defaultPermissionsBuilder)
      .mockResolvedValueOnce({
        data: [{ permission: 'manage_projects' }],
        error: null,
      });
    const adminFrom = vi.fn().mockReturnValue(defaultPermissionsBuilder);

    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: true,
      membershipType: 'GUEST',
    });
    mocks.createClient.mockResolvedValue(createAuthenticatedSupabaseClient());
    mocks.createAdminClient.mockResolvedValue({
      from: adminFrom,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(
      new NextRequest(
        'http://localhost/11111111-1111-4111-8111-111111111111/tasks'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/en/11111111-1111-4111-8111-111111111111/tasks'
    );
    expect(adminFrom).toHaveBeenCalledWith('workspace_default_permissions');
  });

  it('falls back to tasks boards and self-heals when configured board no longer exists', async () => {
    const supabaseClient = createAuthenticatedSupabaseClient();

    const configSelectBuilder = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          value: JSON.stringify({
            target: 'tasks',
            submodule: 'boards',
            boardId: 'deleted-board',
          }),
        },
      }),
    };

    const adminQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const adminUpsert = vi.fn().mockResolvedValue({ error: null });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === 'user_workspace_configs') {
          return {
            select: vi.fn().mockReturnValue(configSelectBuilder),
            upsert: adminUpsert,
          };
        }

        if (table === 'workspace_boards') {
          return adminQueryBuilder;
        }

        return adminQueryBuilder;
      }),
    };

    mocks.createClient.mockResolvedValue(supabaseClient);
    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getUserDefaultWorkspace.mockResolvedValue({
      id: 'ws-1',
      personal: false,
    });

    const { proxy } = await import('../proxy');
    const response = await proxy(new NextRequest('http://localhost/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/ws-1/tasks/boards'
    );
    expect(adminUpsert).toHaveBeenCalled();
  });

  it('excludes audio assets from the proxy matcher so public media is served directly', async () => {
    const { config } = await import('../proxy');

    expect(config.matcher).toContain(
      '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.webmanifest|sw.js|serwist|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|mp3|wav|ogg|m4a|pdf|gif|webp)$).*)'
    );
  });
});
