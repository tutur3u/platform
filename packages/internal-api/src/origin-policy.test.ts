import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalApiClient,
  registerInternalApiOriginPolicy,
  resolveInternalApiUrl,
  withForwardedInternalApiAuth,
} from './client';

const CANONICAL = 'https://tuturuuu.com';

// A policy of the same shape as an app's: unset keeps the canonical origin, a
// set value must be exactly an https origin on the canonical or listed hosts.
function policy(env: Record<string, string | undefined>) {
  const configured = env.INTERNAL_WEB_API_ORIGIN;
  if (configured === undefined) return CANONICAL;
  const hosts = new Set([
    'tuturuuu.com',
    ...(env.TUTURUUU_WEB_API_HOSTS ?? '').split(',').map((h) => h.trim()),
  ]);
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('INTERNAL_WEB_API_ORIGIN is not a valid URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    configured.toLowerCase() !== url.origin ||
    !hosts.has(url.hostname)
  )
    throw new Error('INTERNAL_WEB_API_ORIGIN is not a trusted Web origin');
  return url.origin;
}

const credentials = () =>
  new Headers({
    authorization: 'Bearer ttr_app_secret',
    cookie: 'tuturuuu_app_session=ttr_app_secret',
  });

const untrusted = [
  ['an attacker origin', 'https://evil.example'],
  ['a blank value', ''],
  ['whitespace', '   '],
  ['an http downgrade', 'http://tuturuuu.com'],
  ['a lookalike suffix', 'https://tuturuuu.com.evil.test'],
  ['a lookalike prefix', 'https://evil-tuturuuu.com'],
  ['userinfo', 'https://tuturuuu.com@evil.test'],
  ['a port', 'https://tuturuuu.com:8443'],
  ['a default port', 'https://tuturuuu.com:443'],
  ['a path', 'https://tuturuuu.com/api'],
  ['trailing text', 'https://tuturuuu.com,https://evil.example'],
] as const;

describe('internal API origin policy', () => {
  let unregister: () => void;

  beforeEach(() => {
    unregister = registerInternalApiOriginPolicy(policy);
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    unregister();
    vi.unstubAllEnvs();
  });

  it('keeps the canonical origin when INTERNAL_WEB_API_ORIGIN is unset', () => {
    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      `${CANONICAL}/api/v1/workspaces`
    );
  });

  it('uses an allowlisted origin', () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.example.com');
    vi.stubEnv('TUTURUUU_WEB_API_HOSTS', 'web.example.com');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://web.example.com/api/v1/workspaces'
    );
  });

  it.each(untrusted)(
    'throws before any fetch and forwards no credentials for %s',
    async (_label, origin) => {
      vi.stubEnv('INTERNAL_WEB_API_ORIGIN', origin);
      const fetchMock = vi.fn();

      expect(() => resolveInternalApiUrl('/api/v1/workspaces')).toThrow(
        /INTERNAL_WEB_API_ORIGIN/u
      );
      expect(() =>
        withForwardedInternalApiAuth(credentials(), {
          fetch: fetchMock as unknown as typeof fetch,
        })
      ).toThrow(/INTERNAL_WEB_API_ORIGIN/u);
      await expect(
        createInternalApiClient({
          fetch: fetchMock as unknown as typeof fetch,
        }).json('/api/v1/workspaces')
      ).rejects.toThrow(/INTERNAL_WEB_API_ORIGIN/u);

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('forwards credentials only to the trusted origin', async () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', CANONICAL);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    await createInternalApiClient(
      withForwardedInternalApiAuth(credentials(), {
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).json('/api/v1/workspaces');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CANONICAL}/api/v1/workspaces`);
    expect((init.headers as Headers).get('authorization')).toBe(
      'Bearer ttr_app_secret'
    );
  });
});

describe('without a registered origin policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps resolving the configured origin as before', () => {
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'http://web-proxy:7803');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'http://web-proxy:7803/api/v1/workspaces'
    );
  });

  it('unregisters a policy', () => {
    const unregister = registerInternalApiOriginPolicy(policy);
    unregister();
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://evil.example');

    expect(resolveInternalApiUrl('/api/v1/workspaces')).toBe(
      'https://evil.example/api/v1/workspaces'
    );
  });
});
