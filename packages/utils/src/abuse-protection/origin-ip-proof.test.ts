import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createOriginClientIpProof,
  verifyOriginClientIpProof,
} from './origin-ip-proof';

const secret = 'synthetic-origin-proof-secret-at-least-32';
const nowSeconds = 1_792_940_000;

describe('versioned origin client-IP proof', () => {
  it.each(['203.0.113.42', '2001:db8::42'])(
    'signs canonical %s with RFC HMAC-SHA256',
    (ip) => {
      const proof = createOriginClientIpProof({ ip, secret, nowSeconds });
      const signature = createHmac('sha256', secret)
        .update(`tuturuuu-origin-client-ip/v1\n${nowSeconds}\n${ip}`)
        .digest('hex');
      expect(proof).toBe(`hmac-v1;${nowSeconds};${ip};${signature}`);
      expect(verifyOriginClientIpProof({ proof, secret, nowSeconds })).toBe(ip);
      expect(proof).not.toContain(secret);
    }
  );

  it('rejects a changed IP, timestamp, signature or secret', () => {
    const proof = createOriginClientIpProof({
      ip: '203.0.113.42',
      secret,
      nowSeconds,
    });
    if (!proof) throw new Error('Invalid fixture');
    for (const changed of [
      proof.replace('203.0.113.42', '203.0.113.43'),
      proof.replace(String(nowSeconds), String(nowSeconds + 1)),
      `${proof.slice(0, -1)}z`,
    ]) {
      expect(
        verifyOriginClientIpProof({
          proof: changed ?? null,
          secret,
          nowSeconds,
        })
      ).toBeNull();
    }
    expect(
      verifyOriginClientIpProof({
        proof,
        secret: 'different-fixture-origin-secret-at-least-32',
        nowSeconds,
      })
    ).toBeNull();
  });

  it('limits validity to 60 seconds with at most five seconds of forward clock skew', () => {
    const proof = createOriginClientIpProof({
      ip: '203.0.113.42',
      secret,
      nowSeconds,
    });
    expect(
      verifyOriginClientIpProof({ proof, secret, nowSeconds: nowSeconds + 60 })
    ).toBe('203.0.113.42');
    expect(
      verifyOriginClientIpProof({ proof, secret, nowSeconds: nowSeconds + 61 })
    ).toBeNull();
    expect(
      verifyOriginClientIpProof({ proof, secret, nowSeconds: nowSeconds - 5 })
    ).toBe('203.0.113.42');
    expect(
      verifyOriginClientIpProof({ proof, secret, nowSeconds: nowSeconds - 6 })
    ).toBeNull();
  });

  it('rejects weak secrets, malformed proofs, header chains and non-IP inputs', () => {
    for (const ip of [
      'not-an-ip',
      '203.0.113.1, 203.0.113.2',
      '',
      '203.0.113.999',
    ]) {
      expect(createOriginClientIpProof({ ip, secret, nowSeconds })).toBeNull();
    }
    expect(
      createOriginClientIpProof({
        ip: '203.0.113.42',
        secret: 'short',
        nowSeconds,
      })
    ).toBeNull();
    for (const proof of [
      null,
      '',
      'hmac-v2;fixture',
      'hmac-v1;1;203.0.113.42;signature',
      'x'.repeat(161),
    ]) {
      expect(
        verifyOriginClientIpProof({ proof, secret, nowSeconds })
      ).toBeNull();
    }
    expect(
      verifyOriginClientIpProof({
        proof: createOriginClientIpProof({
          ip: '203.0.113.42',
          secret,
          nowSeconds,
        }),
        secret: 'short',
        nowSeconds,
      })
    ).toBeNull();
  });
});
