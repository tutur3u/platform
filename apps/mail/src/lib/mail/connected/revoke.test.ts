import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seal } from './crypto';
import type { ConnectedAccount } from './repository';
import { GOOGLE_REVOKE_URL, revokeProviderAccess } from './revoke';

const refreshToken = 'synthetic-refresh-secret';
const accessToken = 'synthetic-access-secret';
const account = (
  provider: ConnectedAccount['provider'],
  credentials: Record<string, unknown> = {
    accessToken,
    refreshToken,
    expiresAt: 0,
  }
) => ({
  id: 'account',
  provider,
  user_id: 'owner',
  credentials: seal(credentials, 'owner'),
});
const loggedText = (spy: ReturnType<typeof vi.spyOn>) =>
  JSON.stringify(spy.mock.calls);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider access revocation', () => {
  it('revokes the Google refresh token with a form body and a bounded timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    expect(await revokeProviderAccess(account('google'), fetch)).toBe(true);
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(GOOGLE_REVOKE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(String(init.body)).toBe(
      new URLSearchParams({ token: refreshToken }).toString()
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the access token when no refresh token is stored', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await revokeProviderAccess(
      account('google', { accessToken, expiresAt: 0 }),
      fetch
    );
    expect(String(fetch.mock.calls[0]?.[1].body)).toBe(
      new URLSearchParams({ token: accessToken }).toString()
    );
  });

  it('uses the global fetch when none is injected', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await revokeProviderAccess(account('google'))).toBe(true);
    expect(fetch).toHaveBeenCalledWith(GOOGLE_REVOKE_URL, expect.anything());
  });

  it.each([
    [
      'a rejected token',
      () =>
        Promise.resolve(
          new Response('{"error":"invalid_token"}', { status: 400 })
        ),
    ],
    [
      'a provider outage',
      () => Promise.resolve(new Response(null, { status: 503 })),
    ],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'a timeout',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
  ])(
    'reports false without throwing or logging tokens on %s',
    async (_, reply) => {
      const fetch = vi.fn().mockImplementation(reply);
      expect(await revokeProviderAccess(account('google'), fetch)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(loggedText(warn)).not.toContain(refreshToken);
      expect(loggedText(warn)).not.toContain(accessToken);
    }
  );

  it('reports false when stored credentials cannot be decrypted', async () => {
    const fetch = vi.fn();
    expect(
      await revokeProviderAccess(
        { ...account('google'), credentials: 'not.a.credential' },
        fetch
      )
    ).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('never calls a provider endpoint for Microsoft', async () => {
    const fetch = vi.fn();
    expect(await revokeProviderAccess(account('microsoft'), fetch)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
