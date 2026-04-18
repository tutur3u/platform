import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInternalApiClient, resolveInternalApiUrl } from './client';

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
});
