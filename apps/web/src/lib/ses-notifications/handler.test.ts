// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleSesNotificationRequest,
  SES_WEBHOOK_MAX_BODY_BYTES,
  type SesNotificationDeps,
} from './handler';

const TOPIC = 'arn:aws:sns:ap-southeast-1:123456789012:ses-events';
const CERT_URL =
  'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-0123.pem';

function envelope(message: unknown, overrides: Record<string, unknown> = {}) {
  return {
    Type: 'Notification',
    MessageId: 'sns-message-1',
    TopicArn: TOPIC,
    Message: typeof message === 'string' ? message : JSON.stringify(message),
    Timestamp: '2026-11-11T02:59:00.000Z',
    SignatureVersion: '2',
    Signature: 'c2lnbmF0dXJl',
    SigningCertURL: CERT_URL,
    ...overrides,
  };
}

const bounce = (bounceType: string, key = 'notificationType') => ({
  [key]: 'Bounce',
  bounce: {
    bounceType,
    bounceSubType: 'General',
    bouncedRecipients: [
      { emailAddress: 'Owner@Example.com', diagnosticCode: 'smtp; 550' },
    ],
    timestamp: '2026-11-11T02:58:00.000Z',
  },
  mail: {
    messageId: 'ses-message-1',
    commonHeaders: { subject: 'Body-adjacent data that must not be stored' },
  },
});

const complaint = {
  notificationType: 'Complaint',
  complaint: {
    complainedRecipients: [{ emailAddress: 'owner@example.com' }],
    complaintFeedbackType: 'abuse',
  },
  mail: { messageId: 'ses-message-2' },
};

function request(body: unknown, ip = '203.0.113.7') {
  return new Request('https://tuturuuu.com/api/v1/webhooks/email/ses', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deps(overrides: Partial<SesNotificationDeps> = {}) {
  const base = {
    topicArns: [TOPIC],
    verify: vi.fn(async () => 'valid' as const),
    confirmSubscription: vi.fn(async () => true),
    record: vi.fn(async () => 'recorded' as const),
    allowRequest: vi.fn(async () => true),
  };
  return { ...base, ...overrides } as typeof base;
}

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(JSON.stringify(args));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('SES notification webhook', () => {
  it('rejects an invalid signature with 401 and records nothing', async () => {
    const d = deps({ verify: vi.fn(async () => 'invalid' as const) });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(401);
    expect(d.record).not.toHaveBeenCalled();
  });

  it('rejects a topic that is not allowlisted with 403 before verifying', async () => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(
        envelope(bounce('Permanent'), {
          TopicArn: 'arn:aws:sns:ap-southeast-1:999999999999:other',
        })
      ),
      d
    );
    expect(response.status).toBe(403);
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it('refuses everything with 503 while no topic is configured', async () => {
    const d = deps({ topicArns: [] });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(503);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['notification types', 'notificationType'],
    ['event publishing', 'eventType'],
  ])('records a permanent bounce for suppression (%s)', async (_label, key) => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent', key))),
      d
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'recorded' });
    // Only identifiers and classification reach the store; no body or headers.
    expect(d.record).toHaveBeenCalledWith({
      snsMessageId: 'sns-message-1',
      topicArn: TOPIC,
      kind: 'bounce',
      bounceType: 'Permanent',
      detail: 'General',
      sesMessageId: 'ses-message-1',
      recipients: ['owner@example.com'],
    });
  });

  it('records a complaint for suppression', async () => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(envelope(complaint, { MessageId: 'sns-message-2' })),
      d
    );
    expect(response.status).toBe(200);
    expect(d.record).toHaveBeenCalledWith({
      snsMessageId: 'sns-message-2',
      topicArn: TOPIC,
      kind: 'complaint',
      bounceType: null,
      detail: 'abuse',
      sesMessageId: 'ses-message-2',
      recipients: ['owner@example.com'],
    });
  });

  it('passes a transient bounce as Transient, which the store never suppresses', async () => {
    const d = deps();
    await handleSesNotificationRequest(
      request(envelope(bounce('Transient'))),
      d
    );
    expect(d.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bounce', bounceType: 'Transient' })
    );
  });

  it('answers a duplicate SNS MessageId as a no-op', async () => {
    const d = deps({ record: vi.fn(async () => 'duplicate' as const) });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'duplicate' });
  });

  it('ignores deliveries and other event types', async () => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(
        envelope({ notificationType: 'Delivery', mail: { messageId: 'x' } })
      ),
      d
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'ignored' });
    expect(d.record).not.toHaveBeenCalled();
  });

  it('confirms a subscription only through the trusted SubscribeURL', async () => {
    const SubscribeURL = `https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=abc`;
    const d = deps();
    const ok = await handleSesNotificationRequest(
      request(
        envelope('confirm', {
          Type: 'SubscriptionConfirmation',
          SubscribeURL,
          Token: 'abc',
        })
      ),
      d
    );
    expect(ok.status).toBe(200);
    expect(d.confirmSubscription).toHaveBeenCalledWith(new URL(SubscribeURL));

    const bad = deps();
    const refused = await handleSesNotificationRequest(
      request(
        envelope('confirm', {
          Type: 'SubscriptionConfirmation',
          SubscribeURL: 'https://evil.example/?Action=ConfirmSubscription',
          Token: 'abc',
        })
      ),
      bad
    );
    expect(refused.status).toBe(400);
    expect(bad.confirmSubscription).not.toHaveBeenCalled();
  });

  it('acknowledges an unsubscribe confirmation without acting on it', async () => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(
        envelope('bye', {
          Type: 'UnsubscribeConfirmation',
          SubscribeURL:
            'https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription',
          Token: 'abc',
        })
      ),
      d
    );
    expect(response.status).toBe(200);
    expect(d.confirmSubscription).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
  });

  it('rate-limits per client IP with 429', async () => {
    const d = deps({ allowRequest: vi.fn(async () => false) });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(429);
    expect(d.allowRequest).toHaveBeenCalledWith('203.0.113.7');
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('rejects malformed and oversized bodies', async () => {
    const d = deps();
    expect(
      (await handleSesNotificationRequest(request('{not json'), d)).status
    ).toBe(400);
    expect(
      (await handleSesNotificationRequest(request({ Type: 'Notification' }), d))
        .status
    ).toBe(400);
    expect(
      (
        await handleSesNotificationRequest(
          request('x'.repeat(SES_WEBHOOK_MAX_BODY_BYTES + 1)),
          d
        )
      ).status
    ).toBe(413);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('rejects a verified notification whose SES message is malformed', async () => {
    const d = deps();
    const response = await handleSesNotificationRequest(
      request(envelope({ notificationType: 'Bounce', bounce: {} })),
      d
    );
    expect(response.status).toBe(400);
    expect(d.record).not.toHaveBeenCalled();
  });

  it('returns 500 on a store failure so SNS retries, without logging addresses', async () => {
    const d = deps({
      record: vi.fn(async () => {
        throw new Error('db down for owner@example.com');
      }),
    });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(500);
    expect(logs.join('')).not.toContain('@');
  });

  it('returns 503 when the signing certificate is temporarily unavailable, so SNS retries', async () => {
    const d = deps({ verify: vi.fn(async () => 'unavailable' as const) });
    const response = await handleSesNotificationRequest(
      request(envelope(bounce('Permanent'))),
      d
    );
    expect(response.status).toBe(503);
    expect(d.record).not.toHaveBeenCalled();
  });

  it('stops reading a chunked body without Content-Length at the cap (413)', async () => {
    const chunk = new Uint8Array(16 * 1024).fill(0x20);
    const totalChunks = 200; // 3.2 MiB if fully read
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > totalChunks) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const streamed = new Request(
      'https://tuturuuu.com/api/v1/webhooks/email/ses',
      {
        method: 'POST',
        body,
        headers: { 'x-forwarded-for': '203.0.113.7' },
        duplex: 'half',
      } as RequestInit
    );
    expect(streamed.headers.get('content-length')).toBeNull();
    const d = deps();

    const response = await handleSesNotificationRequest(streamed, d);

    expect(response.status).toBe(413);
    const capChunks = Math.ceil(SES_WEBHOOK_MAX_BODY_BYTES / chunk.length);
    expect(pulled).toBeLessThanOrEqual(capChunks + 3);
    expect(d.verify).not.toHaveBeenCalled();
  });
});
