import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isCanonicalCloudflareIngress,
  verifyCloudflareWebhookSignature,
} from './cloudflare';

describe('verifyCloudflareWebhookSignature', () => {
  it('accepts a current HMAC signature', () => {
    const body = '{"type":"domain_check"}';
    const now = Date.UTC(2026, 6, 10, 0, 0, 0);
    const timestamp = Math.floor(now / 1000).toString();
    const signature = createHmac('sha256', 'secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');

    expect(
      verifyCloudflareWebhookSignature({
        body,
        now,
        secret: 'secret',
        signature,
        timestamp,
      })
    ).toBe(true);
  });

  it('rejects stale and malformed signatures', () => {
    expect(
      verifyCloudflareWebhookSignature({
        body: '{}',
        now: 1_000_000,
        secret: 'secret',
        signature: 'not-a-signature',
        timestamp: '1',
      })
    ).toBe(false);
  });
});

describe('isCanonicalCloudflareIngress', () => {
  it('accepts a same-local-part shadow delivery', () => {
    expect(
      isCanonicalCloudflareIngress({
        canonicalDomain: 'tuturuuu.com',
        canonicalRecipient: 'phucvo@tuturuuu.com',
        eventDomain: 'tuturuuu.com',
        ingressDomain: 'ingest.tutur3u.com',
        observedRecipient: 'phucvo@ingest.tutur3u.com',
      })
    ).toBe(true);
  });

  it('rejects a cross-mailbox or noncanonical event mapping', () => {
    expect(
      isCanonicalCloudflareIngress({
        canonicalDomain: 'tuturuuu.com',
        canonicalRecipient: 'other@tuturuuu.com',
        eventDomain: 'tuturuuu.com',
        ingressDomain: 'ingest.tutur3u.com',
        observedRecipient: 'phucvo@ingest.tutur3u.com',
      })
    ).toBe(false);
    expect(
      isCanonicalCloudflareIngress({
        canonicalDomain: 'tuturuuu.com',
        canonicalRecipient: 'phucvo@tuturuuu.com',
        eventDomain: 'ingest.tutur3u.com',
        ingressDomain: 'ingest.tutur3u.com',
        observedRecipient: 'phucvo@ingest.tutur3u.com',
      })
    ).toBe(false);
  });
});
