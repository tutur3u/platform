import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  type ClientIpConfig,
  isAuthenticatedCloudflareOrigin,
  resolveClientIp,
  resolveTrustedProxyConfig,
  TRUSTED_PROXY_ORIGIN_SECRET_ENV,
  UNKNOWN_CLIENT_IP,
} from '../client-ip';

const SECRET = 's'.repeat(40);
const config = (originAuthSecret?: string): ClientIpConfig => ({
  mode: 'cloudflare-origin',
  trustedHops: 1,
  originAuthSecret,
});
const request = (auth?: string) =>
  new Headers({
    'cf-connecting-ip': '203.0.113.7',
    'x-vercel-forwarded-for': '198.51.100.9',
    ...(auth === undefined ? {} : { [CLOUDFLARE_ORIGIN_AUTH_HEADER]: auth }),
  });

afterEach(() => vi.restoreAllMocks());

describe('cloudflare-origin trusted proxy', () => {
  it('trusts the Cloudflare client IP only with the origin secret', () => {
    expect(resolveClientIp(request(SECRET), config(SECRET))).toBe(
      '203.0.113.7'
    );
    expect(
      isAuthenticatedCloudflareOrigin(request(SECRET), config(SECRET))
    ).toBe(true);
  });

  it('falls back to the Vercel client IP for direct origin hits', () => {
    for (const auth of [undefined, '', 'wrong', `${SECRET}x`, SECRET.slice(1)])
      expect(resolveClientIp(request(auth), config(SECRET))).toBe(
        '198.51.100.9'
      );
  });

  it('never authenticates without a configured secret', () => {
    expect(isAuthenticatedCloudflareOrigin(request(''), config())).toBe(false);
    expect(resolveClientIp(request(''), config())).toBe('198.51.100.9');
    expect(
      isAuthenticatedCloudflareOrigin(request(SECRET), {
        mode: 'vercel',
        trustedHops: 1,
        originAuthSecret: SECRET,
      })
    ).toBe(false);
  });

  it('returns the shared bucket when neither source supplies an IP', () => {
    expect(resolveClientIp(new Headers(), config(SECRET))).toBe(
      UNKNOWN_CLIENT_IP
    );
  });

  it('reads the secret from env and rejects short secrets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      resolveTrustedProxyConfig({
        env: {
          TRUSTED_PROXY: 'cloudflare-origin',
          [TRUSTED_PROXY_ORIGIN_SECRET_ENV]: ` ${SECRET} `,
        },
      })
    ).toEqual(config(SECRET));
    expect(
      resolveTrustedProxyConfig({
        env: {
          TRUSTED_PROXY: 'cloudflare-origin',
          [TRUSTED_PROXY_ORIGIN_SECRET_ENV]: 'short',
        },
      }).originAuthSecret
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
