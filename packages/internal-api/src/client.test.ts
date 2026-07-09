import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  InternalApiError,
  resolveInternalApiUrl,
  withEducationBootstrapBaseUrl,
  withFinanceApiBaseUrl,
  withForwardedInternalApiAuth,
  withLearnApiBaseUrl,
  withPayApiBaseUrl,
  withTaskApiBaseUrl,
  withTeachApiBaseUrl,
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

describe('withTaskApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured tasks API origin for server task calls', () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.example.com');

    expect(withTaskApiBaseUrl()).toMatchObject({
      baseUrl: 'https://tasks.example.com',
    });
  });

  it('keeps browser calls relative when already on the tasks origin', () => {
    vi.stubGlobal('location', {
      hostname: 'tasks.tuturuuu.com',
      origin: 'https://tasks.tuturuuu.com',
    });

    expect(withTaskApiBaseUrl()).toEqual({});
  });
});

describe('withLearnApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured learn API origin for server learn calls', () => {
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');

    expect(withLearnApiBaseUrl()).toMatchObject({
      baseUrl: 'https://learn.example.com',
    });
  });

  it('keeps browser calls relative when already on the learn origin', () => {
    vi.stubGlobal('location', {
      hostname: 'learn.tuturuuu.com',
      origin: 'https://learn.tuturuuu.com',
    });

    expect(withLearnApiBaseUrl()).toEqual({});
  });

  it('keeps server learn calls relative when running inside the learn app', () => {
    vi.stubEnv('npm_package_name', '@tuturuuu/learn');
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');

    expect(withLearnApiBaseUrl()).toEqual({});
  });
});

describe('withTeachApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured teach API origin for server teach calls', () => {
    vi.stubEnv('TEACH_APP_URL', 'https://teach.example.com');

    expect(withTeachApiBaseUrl()).toMatchObject({
      baseUrl: 'https://teach.example.com',
    });
  });

  it('keeps browser calls relative when already on the teach origin', () => {
    vi.stubGlobal('location', {
      hostname: 'teach.tuturuuu.com',
      origin: 'https://teach.tuturuuu.com',
    });

    expect(withTeachApiBaseUrl()).toEqual({});
  });
});

describe('withFinanceApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured finance API origin for server finance calls', () => {
    vi.stubEnv('FINANCE_APP_URL', 'https://finance.example.com');

    expect(withFinanceApiBaseUrl()).toMatchObject({
      baseUrl: 'https://finance.example.com',
    });
  });

  it('keeps browser calls relative when already on the finance origin', () => {
    vi.stubGlobal('location', {
      hostname: 'finance.tuturuuu.com',
      origin: 'https://finance.tuturuuu.com',
    });

    expect(withFinanceApiBaseUrl()).toEqual({});
  });

  it('keeps server finance calls relative when running inside the finance app', () => {
    vi.stubEnv('npm_package_name', '@tuturuuu/finance');
    vi.stubEnv('FINANCE_APP_URL', 'https://finance.example.com');

    expect(withFinanceApiBaseUrl()).toEqual({});
  });
});

describe('withPayApiBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the configured pay API origin for server pay calls', () => {
    vi.stubEnv('PAY_APP_URL', 'https://pay.example.com');

    expect(withPayApiBaseUrl()).toMatchObject({
      baseUrl: 'https://pay.example.com',
    });
  });

  it('keeps browser calls relative when already on the pay origin', () => {
    vi.stubGlobal('location', {
      hostname: 'pay.tuturuuu.com',
      origin: 'https://pay.tuturuuu.com',
    });

    expect(withPayApiBaseUrl()).toEqual({});
  });

  it('keeps server pay calls relative when running inside the pay app', () => {
    vi.stubEnv('npm_package_name', '@tuturuuu/pay');
    vi.stubEnv('PAY_APP_URL', 'https://pay.example.com');

    expect(withPayApiBaseUrl()).toEqual({});
  });
});

describe('withEducationBootstrapBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('resolves bootstrap to the learn origin from a non-education runtime', () => {
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');

    expect(withEducationBootstrapBaseUrl()).toMatchObject({
      baseUrl: 'https://learn.example.com',
    });
  });

  it('keeps bootstrap relative when running inside the teach app', () => {
    vi.stubEnv('npm_package_name', '@tuturuuu/teach');
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');
    vi.stubEnv('TEACH_APP_URL', 'https://teach.example.com');

    expect(withEducationBootstrapBaseUrl()).toEqual({});
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

  it('forwards app-session auth to the learn satellite origin', async () => {
    vi.stubEnv('LEARN_APP_URL', 'https://learn.example.com');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie: 'tuturuuu_app_session=ttr_app_123; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://learn.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json(
      '/api/v1/workspaces/personal/tulearn/home'
    );

    const [, init] = fetchMock.mock.calls[0];
    const forwardedCookie = (init.headers as Headers).get('cookie');
    expect(forwardedCookie).toBe(
      'tuturuuu_app_session=ttr_app_123; theme=dark'
    );
  });

  it('forwards app-session auth to the finance satellite origin', async () => {
    vi.stubEnv('FINANCE_APP_URL', 'https://finance.example.com');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie: 'tuturuuu_app_session=ttr_app_123; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://finance.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json(
      '/api/v1/workspaces/personal/finance/overview'
    );

    const [, init] = fetchMock.mock.calls[0];
    const forwardedCookie = (init.headers as Headers).get('cookie');
    expect(forwardedCookie).toBe(
      'tuturuuu_app_session=ttr_app_123; theme=dark'
    );
  });

  it('forwards app-session auth to the teach satellite origin', async () => {
    vi.stubEnv('TEACH_APP_URL', 'https://teach.example.com');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      cookie: 'tuturuuu_app_session=ttr_app_123; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      baseUrl: 'https://teach.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json(
      '/api/v1/workspaces/personal/teach/dashboard-stats'
    );

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

  it('forwards TanStack production requests to the platform API with sanitized shared auth', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tanstack.tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'production');
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
      authorization: 'Bearer user-token',
      cookie:
        'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=web-session; sb-stale-auth-token=stale; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/workspaces');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tuturuuu.com/api/v1/workspaces');
    expect((init.headers as Headers).get('authorization')).toBe(
      'Bearer user-token'
    );
    expect((init.headers as Headers).get('cookie')).toBe(
      'tuturuuu_app_session=ttr_app_123; sb-resolved-kingfish-21146-auth-token=web-session; theme=dark'
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

  it('forwards TanStack local requests to the platform API with sanitized shared auth', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:7824');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:8001');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      authorization: 'Bearer local-token',
      cookie:
        'tuturuuu_app_session=ttr_app_123; sb-127-auth-token=local-session; sb-stale-auth-token=stale; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json('/api/v1/workspaces');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tuturuuu.localhost/api/v1/workspaces');
    expect((init.headers as Headers).get('authorization')).toBe(
      'Bearer local-token'
    );
    expect((init.headers as Headers).get('cookie')).toBe(
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

  it('does not forward incoming auth back to the TanStack app origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tanstack.tuturuuu.com');
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const headers = new Headers({
      authorization: 'Bearer user-token',
      cookie: 'tuturuuu_app_session=ttr_app_123; theme=dark',
    });
    const options = withForwardedInternalApiAuth(headers, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    await createInternalApiClient(options).json(
      'https://tanstack.tuturuuu.com/api/probe'
    );

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Headers).get('authorization')).toBeNull();
    expect((init.headers as Headers).get('cookie')).toBeNull();
  });
});
