import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  InternalApiError,
  resolveInternalApiUrl,
  withForwardedInternalApiAuth,
} from './client';

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

describe('withForwardedInternalApiAuth', () => {
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
