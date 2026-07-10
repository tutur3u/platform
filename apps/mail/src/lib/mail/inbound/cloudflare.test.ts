import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCloudflareWebhookSignature } from './cloudflare';

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
