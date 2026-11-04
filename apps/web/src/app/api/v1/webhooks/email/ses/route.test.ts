// @vitest-environment node
vi.mock('server-only', () => ({}));

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  admin: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimitRedis: mocks.rateLimit }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

import { configuredTopicArns } from '@/lib/ses-notifications/runtime';
import { POST } from './route';

const original = process.env.SES_NOTIFICATIONS_TOPIC_ARNS;
afterEach(() => {
  process.env.SES_NOTIFICATIONS_TOPIC_ARNS = original;
});

describe('SES notification route', () => {
  it('refuses with 503 and touches nothing while no topic is configured', async () => {
    delete process.env.SES_NOTIFICATIONS_TOPIC_ARNS;
    const response = await POST(
      new Request('https://tuturuuu.com/api/v1/webhooks/email/ses', {
        method: 'POST',
        body: JSON.stringify({
          Type: 'Notification',
          MessageId: 'm',
          TopicArn: 'arn:aws:sns:ap-southeast-1:123456789012:ses-events',
          Message: '{}',
          Timestamp: '2026-11-11T00:00:00.000Z',
          SignatureVersion: '2',
          Signature: 'cw==',
          SigningCertURL:
            'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-1.pem',
        }),
      })
    );
    expect(response.status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('accepts only well-formed topic ARNs from configuration', () => {
    expect(
      configuredTopicArns(
        ' arn:aws:sns:ap-southeast-1:123456789012:ses-events ,bogus,arn:aws:sns:us-east-1:12:x'
      )
    ).toEqual(['arn:aws:sns:ap-southeast-1:123456789012:ses-events']);
  });
});
