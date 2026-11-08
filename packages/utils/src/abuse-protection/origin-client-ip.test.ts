import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  type ClientIpConfig,
  isAuthenticatedCloudflareOrigin,
  resolveClientIp,
} from './client-ip';
import { createOriginClientIpProof } from './origin-ip-proof';

const secret = 'synthetic-cloudflare-origin-secret-at-least-32';
const config: ClientIpConfig = {
  mode: 'cloudflare-origin',
  trustedHops: 1,
  originAuthSecret: secret,
};
const headersFor = (proof: string) =>
  new Headers({
    [CLOUDFLARE_ORIGIN_AUTH_HEADER]: proof,
    'cf-connecting-ip': '198.51.100.10',
    'x-vercel-forwarded-for': '198.51.100.20',
    'x-forwarded-for': '198.51.100.30',
  });

describe('one origin trust mechanism', () => {
  it('resolves the signed client IP instead of Worker or Vercel egress headers', () => {
    const proof = createOriginClientIpProof({ ip: '203.0.113.42', secret });
    if (!proof) throw new Error('Invalid fixture');
    const headers = headersFor(proof);
    expect(isAuthenticatedCloudflareOrigin(headers, config)).toBe(true);
    expect(resolveClientIp(headers, config)).toBe('203.0.113.42');
  });

  it('preserves the raw-secret apex Transform Rule and ordinary direct-origin fallback', () => {
    expect(resolveClientIp(headersFor(secret), config)).toBe('198.51.100.10');
    expect(resolveClientIp(headersFor('forged'), config)).toBe('198.51.100.20');
    expect(
      resolveClientIp(headersFor(secret), { mode: 'vercel', trustedHops: 1 })
    ).toBe('198.51.100.20');
    expect(
      resolveClientIp(headersFor('short'), {
        ...config,
        originAuthSecret: 'short',
      })
    ).toBe('198.51.100.20');
  });

  it('rejects expired, forged and missing-key proofs while preserving Vercel identity', () => {
    const expired = createOriginClientIpProof({
      ip: '203.0.113.42',
      secret,
      nowSeconds: Math.floor(Date.now() / 1000) - 61,
    });
    const forged = createOriginClientIpProof({
      ip: '203.0.113.42',
      secret: 'other-synthetic-origin-secret-at-least-32',
    });
    for (const proof of [expired, forged]) {
      if (!proof) throw new Error('Invalid fixture');
      const headers = headersFor(proof);
      expect(isAuthenticatedCloudflareOrigin(headers, config)).toBe(false);
      expect(resolveClientIp(headers, config)).toBe('198.51.100.20');
    }
    const proof = createOriginClientIpProof({ ip: '203.0.113.42', secret });
    if (!proof) throw new Error('Invalid fixture');
    expect(
      resolveClientIp(headersFor(proof), {
        ...config,
        originAuthSecret: undefined,
      })
    ).toBe('198.51.100.20');
  });
});
