import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  getConfiguredInternalApiBaseUrl,
} from './client';

const key = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');
const anchor = globalThis as Record<symbol, unknown>;
const previous = anchor[key];

afterEach(() => {
  if (previous === undefined) delete anchor[key];
  else anchor[key] = previous;
  vi.unstubAllEnvs();
});

describe('credentialed Web origin reads', () => {
  it.each(['https://evil.example', '', 'https://tuturuuu.com@evil.example'])(
    'rejects %j before forwarding credentials or falling back',
    async (origin) => {
      vi.stubEnv('INTERNAL_WEB_API_ORIGIN', origin);
      vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
      anchor[key] = () => {
        throw new Error('Untrusted Web origin');
      };
      const fetch = vi.fn();
      const client = createInternalApiClient({
        fetch,
        defaultHeaders: {
          Cookie: 'session=fixture',
          Authorization: 'Bearer fixture',
        },
      });
      await expect(client.json('/api/v1/probe')).rejects.toThrow(
        'Untrusted Web origin'
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('resolves again on every read, including when the binding becomes unset', () => {
    const policy = vi.fn((env: Record<string, string | undefined>) => {
      if (env.INTERNAL_WEB_API_ORIGIN === 'https://evil.example')
        throw new Error('Untrusted Web origin');
      return env.INTERNAL_WEB_API_ORIGIN ?? 'https://tuturuuu.com';
    });
    anchor[key] = policy;
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.tutur3u.com');
    expect(getConfiguredInternalApiBaseUrl()).toBe('https://web.tutur3u.com');
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://evil.example');
    expect(getConfiguredInternalApiBaseUrl).toThrow('Untrusted Web origin');
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', undefined);
    vi.stubEnv('WEB_APP_URL', 'https://unintended.example');
    expect(getConfiguredInternalApiBaseUrl()).toBe('https://tuturuuu.com');
    expect(policy).toHaveBeenCalledTimes(3);
  });

  it('forwards credentials only to the policy origin across module instances', async () => {
    anchor[key] = () => 'https://web.tutur3u.com';
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.tutur3u.com');
    vi.resetModules();
    const { createInternalApiClient: createClient } = await import('./client');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('{}')
    );
    const client = createClient({
      fetch,
      defaultHeaders: {
        Cookie: 'session=fixture',
        Authorization: 'Bearer fixture',
      },
    });
    await client.json('/api/v1/probe');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://web.tutur3u.com/api/v1/probe');
    expect(new Headers(init?.headers).get('Cookie')).toBe('session=fixture');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer fixture'
    );
  });

  it('keeps unregistered app configuration behavior', () => {
    delete anchor[key];
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'http://localhost:7803');
    expect(getConfiguredInternalApiBaseUrl()).toBe('http://localhost:7803');
  });
});
