import { describe, expect, it } from 'vitest';
import {
  abuseSubject,
  cloudflareWorkerZone,
  ORIGIN_WORKER_HEADER,
} from '../abuse-subject';
import {
  CLOUDFLARE_ORIGIN_AUTH_HEADER,
  type ClientIpConfig,
} from '../client-ip';
import { createOriginClientIpProof } from '../origin-ip-proof';

const WORKER_EGRESS = '2a06:98c0:3600::103';
const secret = 'synthetic-cloudflare-origin-secret-at-least-32';
const origin: ClientIpConfig = {
  mode: 'cloudflare-origin',
  trustedHops: 1,
  originAuthSecret: secret,
};
const direct: ClientIpConfig = { mode: 'cloudflare', trustedHops: 1 };

describe('abuseSubject', () => {
  it('keeps a visitor address as its own subject', () => {
    expect(
      abuseSubject(
        new Headers({ 'cf-worker': 'x.example' }),
        '203.0.113.4',
        direct
      )
    ).toBe('203.0.113.4');
    expect(abuseSubject(new Headers(), 'unknown', direct)).toBe('unknown');
  });

  it('blocks a shared address only through its calling Worker zone', () => {
    expect(
      abuseSubject(
        new Headers({ 'cf-worker': 'Evil.Example' }),
        WORKER_EGRESS,
        direct
      )
    ).toBe('worker:evil.example');
    expect(abuseSubject(new Headers(), WORKER_EGRESS, direct)).toBe('unknown');
    expect(
      abuseSubject(
        new Headers({ 'cf-worker': 'tuturuuu.com' }),
        WORKER_EGRESS,
        direct
      )
    ).toBe('unknown');
  });

  it('trusts the gateway-forwarded zone only beside a valid proof for that address', () => {
    const proof = createOriginClientIpProof({ ip: WORKER_EGRESS, secret });
    if (!proof) throw new Error('Invalid fixture');
    const signed = new Headers({
      [CLOUDFLARE_ORIGIN_AUTH_HEADER]: proof,
      [ORIGIN_WORKER_HEADER]: 'caller.example',
      'cf-worker': 'tuturuuu.com',
    });
    expect(cloudflareWorkerZone(signed, WORKER_EGRESS, origin)).toBe(
      'caller.example'
    );

    const forged = new Headers({
      [CLOUDFLARE_ORIGIN_AUTH_HEADER]: 'hmac-v1;forged',
      [ORIGIN_WORKER_HEADER]: 'rotated.example',
    });
    expect(cloudflareWorkerZone(forged, WORKER_EGRESS, origin)).toBe(null);
    const otherIp = createOriginClientIpProof({ ip: '172.64.0.9', secret });
    if (!otherIp) throw new Error('Invalid fixture');
    expect(
      cloudflareWorkerZone(
        new Headers({
          [CLOUDFLARE_ORIGIN_AUTH_HEADER]: otherIp,
          [ORIGIN_WORKER_HEADER]: 'rotated.example',
        }),
        WORKER_EGRESS,
        origin
      )
    ).toBe(null);
  });
});
