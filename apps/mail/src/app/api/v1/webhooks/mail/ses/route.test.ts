import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const inbound = vi.hoisted(() => ({
  ingestSesNotification: vi.fn(),
  logSesInboundError: vi.fn(),
  parseSnsEnvelope: vi.fn(),
  verifySnsEnvelope: vi.fn(),
}));
vi.mock('@/lib/mail/inbound', () => inbound);

import { POST } from './route';

const sesRequest = () =>
  new NextRequest('https://mail.tuturuuu.com/api/v1/webhooks/mail/ses', {
    method: 'POST',
    body: '{}',
  });
const post = () => POST(sesRequest());

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SES inbound webhook', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])(
    'answers 410 before reading the body when the topic ARN is %s',
    async (_label, value) => {
      vi.stubEnv('MAIL_SES_INBOUND_TOPIC_ARN', value as string);
      const request = sesRequest();
      const response = await POST(request);
      expect(request.bodyUsed).toBe(false);
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({
        error: 'SES inbound is not configured',
      });
      expect(inbound.parseSnsEnvelope).not.toHaveBeenCalled();
      expect(inbound.verifySnsEnvelope).not.toHaveBeenCalled();
    }
  );

  it('verifies the SNS envelope when SES inbound is configured', async () => {
    vi.stubEnv(
      'MAIL_SES_INBOUND_TOPIC_ARN',
      'arn:aws:sns:us-east-1:123456789012:mail-inbound'
    );
    inbound.parseSnsEnvelope.mockReturnValue({
      envelope: { Type: 'Notification' },
      notification: {},
    });
    inbound.verifySnsEnvelope.mockResolvedValue(false);
    const response = await post();
    expect(response.status).toBe(401);
    expect(inbound.verifySnsEnvelope).toHaveBeenCalledOnce();
  });
});
