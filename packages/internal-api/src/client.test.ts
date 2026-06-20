import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  InternalApiError,
  resolveInternalApiUrl,
  withForwardedInternalApiAuth,
} from './client';
import { listWorkspaces } from './workspaces';

describe('resolveInternalApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the provided absolute path as-is', () => {
    expect(resolveInternalApiUrl('https://example.com/api/v1/workspaces')).toBe(
      'https://example.com/api/v1/workspaces'
    );
  });

  it('uses the configured web app origin on the server', () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://internal.example.com');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://internal.example.com/api/v1/workspaces'
    );
  });

  it('ignores Chat NEXT_PUBLIC_APP_URL values on the server', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chat.tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'production');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.com/api/v1/workspaces'
    );
  });

  it('ignores Storefront NEXT_PUBLIC_APP_URL values on the server', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://storefront.tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'production');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.com/api/v1/workspaces'
    );

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:7822');
    vi.stubEnv('NODE_ENV', 'development');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.localhost/api/v1/workspaces'
    );
  });

  it('ignores TanStack migration NEXT_PUBLIC_APP_URL values on the server', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tanstack.tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'production');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.com/api/v1/workspaces'
    );

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:7824');
    vi.stubEnv('NODE_ENV', 'development');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.localhost/api/v1/workspaces'
    );
  });

  it('keeps explicit Web API origins ahead of satellite app URLs', () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.internal.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chat.tuturuuu.com');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://web.internal.example.com/api/v1/workspaces'
    );
  });

  it('allows platform NEXT_PUBLIC_APP_URL values on the server', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tuturuuu.com');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://tuturuuu.com/api/v1/workspaces'
    );
  });

  it('falls back to Coolify URLs when explicit app origins are missing', () => {
    vi.stubEnv(
      'COOLIFY_URL',
      'https://app.example.com,https://secondary.example.com'
    );

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://app.example.com/api/v1/workspaces'
    );
  });

  it('falls back to Coolify FQDN values when URLs are missing', () => {
    vi.stubEnv('COOLIFY_FQDN', 'app.example.com,secondary.example.com');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://app.example.com/api/v1/workspaces'
    );
  });
});

describe('createInternalApiClient', () => {
  it('merges query params and default headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const client = createInternalApiClient({
      baseUrl: 'https://internal.example.com',
      defaultHeaders: {
        Authorization: 'Bearer token',
      },
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.json('/api/v1/workspaces', {
      query: { page: 1, q: 'alpha' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces?page=1&q=alpha',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('authorization')).toBe('Bearer token');
    expect((init.headers as Headers).get('accept')).toBe('application/json');
  });

  it('surfaces browser verification challenges with CLI-specific guidance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'ABUSE_CHALLENGE_REQUIRED',
          message: 'Additional verification is required before retrying.',
        },
        {
          headers: { 'X-Abuse-Challenge': 'turnstile' },
          status: 403,
        }
      )
    );

    const client = createInternalApiClient({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    let captured: unknown;

    try {
      await client.json('/api/v1/workspaces/ws/tasks');
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(InternalApiError);
    expect((captured as InternalApiError).message).toContain(
      'browser verification challenge'
    );
    expect((captured as InternalApiError).code).toBe(
      'ABUSE_CHALLENGE_REQUIRED'
    );
    expect((captured as InternalApiError).status).toBe(403);
  });
});

describe('workspace API helpers', () => {
  it('builds searchable workspace-list URLs while preserving client options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await listWorkspaces(
      { limit: 25, q: 'alpha' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces?limit=25&q=alpha',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('keeps legacy listWorkspaces(options) calls compatible', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await listWorkspaces({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });
});

describe('withForwardedInternalApiAuth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips Supabase auth cookies when forwarding Tuturuuu app-session auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie:
        'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/hive/servers');

    const [, init] = fetchMock.mock.calls[0];
    const forwardedCookie = (init.headers as Headers).get('cookie');
    expect(forwardedCookie).toBe(
      'tuturuuu_app_session=ttr_app_123; theme=dark'
    );
  });

  it('preserves canonical shared Supabase auth cookies for production Tuturuuu internal API calls', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://resolved-kingfish-21146.supabase.co'
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie:
        'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=web-session; sb-resolved-kingfish-21146-auth-token.0=chunk; sb-stale-auth-token=stale; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/hive/servers');

    const [, init] = fetchMock.mock.calls[0];
    const forwardedCookie = (init.headers as Headers).get('cookie');
    expect(forwardedCookie).toBe(
      'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=web-session; sb-resolved-kingfish-21146-auth-token.0=chunk; theme=dark'
    );
  });

  it('preserves canonical shared Supabase auth cookies for local Tuturuuu internal API calls', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie:
        'tuturuuu_app_session=ttr_app_123; sb-127-auth-token=local-session; sb-stale-auth-token=stale; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://tuturuuu.localhost',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/hive/servers');

    const [, init] = fetchMock.mock.calls[0];
    const forwardedCookie = (init.headers as Headers).get('cookie');
    expect(forwardedCookie).toBe(
      'tuturuuu_app_session=ttr_app_123; sb-127-auth-token=local-session; theme=dark'
    );
  });

  it('preserves Supabase auth cookies when no app-session cookie is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie: 'sb-resolved-kingfish-21146-auth-token=web-session; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/workspaces');

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('cookie')).toBe(
      'sb-resolved-kingfish-21146-auth-token=web-session; theme=dark'
    );
  });
});
