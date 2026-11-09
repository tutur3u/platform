import { generateKeyPairSync, sign } from 'node:crypto';
import type { AppealBinding } from '@tuturuuu/email-service/appeal-transport';
import { describe, expect, it, vi } from 'vitest';
import {
  APPEAL_FEEDBACK_MAX_BYTES,
  type AppealFeedbackDependencies,
  handleAppealFeedback,
} from './feedback-handler';
import {
  createSnsVerifier,
  type SnsEnvelope,
  snsSigningPayload,
} from './feedback-sns';

const now = Date.parse('2026-11-09T12:00:00Z');
const accountId = '123456789012';
const region = 'ap-southeast-1';
const topic = `arn:aws:sns:${region}:${accountId}:appeal-feedback`;
const wsId = '11111111-1111-4111-8111-111111111111';
const appealId = '22222222-2222-4222-8222-222222222222';
const dispatchId = '44444444-4444-4444-8444-444444444444';
const email = 'recipient@example.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const binding: AppealBinding = {
  grantId: '33333333-3333-4333-8333-333333333333',
  sourceAccountId: '999999999999',
  sourceRegion: region,
  accountId,
  region,
  identity: 'confirm@example.org',
  configurationSet: 'appeals',
  ipPool: 'transactional',
  purpose: 'workspace_report_reenable',
  confirmationOrigin: 'https://example.org',
};

function bounceEvent() {
  return {
    eventType: 'Bounce',
    mail: {
      messageId: 'ses-actual-message',
      sendingAccountId: accountId,
      source: binding.identity,
      sourceArn: `arn:aws:ses:${region}:${accountId}:identity/example.org`,
      destination: [email],
      tags: {
        appeal_id: [appealId],
        workspace_id: [wsId],
        appeal_dispatch_id: [dispatchId],
        appeal_dispatch_kind: ['confirmation'],
        'ses:configuration-set': [binding.configurationSet],
      },
    },
    bounce: {
      bounceType: 'Permanent',
      bouncedRecipients: [{ emailAddress: email }],
    },
  };
}

function envelope(
  event: unknown = bounceEvent(),
  overrides: Partial<SnsEnvelope> = {}
): SnsEnvelope {
  const value: SnsEnvelope = {
    Type: 'Notification',
    MessageId: 'sns-delivery-event',
    TopicArn: topic,
    Message: JSON.stringify(event),
    Timestamp: new Date(now).toISOString(),
    SignatureVersion: '2',
    Signature: 'unsigned',
    SigningCertURL: `https://sns.${region}.amazonaws.com/SimpleNotificationService-fixture.pem`,
    ...overrides,
  };
  value.Signature = sign(
    'RSA-SHA256',
    Buffer.from(snsSigningPayload(value)),
    privateKey
  ).toString('base64');
  return value;
}

function request(value: SnsEnvelope) {
  return new Request('https://example.org/api/v1/webhooks/email/appeals', {
    method: 'POST',
    body: JSON.stringify(value),
  });
}

function dependencies() {
  const fetchCertificate = vi.fn(async () => 'synthetic-certificate');
  const verify = createSnsVerifier({
    now: () => now,
    fetchCertificate,
    parseCertificate: () => ({
      publicKey,
      validFrom: new Date(now - 1000).toISOString(),
      validTo: new Date(now + 1000).toISOString(),
      issuer: 'O=Amazon',
      checkHost: (host) =>
        host === `sns.${region}.amazonaws.com` ? host : undefined,
    }),
  });
  const authenticate = vi.fn(verify);
  const record = vi.fn<AppealFeedbackDependencies['record']>(
    async () => 'recorded'
  );
  return {
    bindings: [binding],
    topics: [topic],
    authenticate,
    record,
    fetchCertificate,
  };
}

describe('appeal signed feedback boundary', () => {
  it('records only pinned actual source, message, tags and recipient fields', async () => {
    const deps = dependencies();
    const response = await handleAppealFeedback(request(envelope()), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'recorded' });
    expect(deps.record).toHaveBeenCalledExactlyOnceWith({
      eventId: 'sns-delivery-event',
      messageId: 'ses-actual-message',
      appealId,
      dispatchId,
      dispatchKind: 'confirmation',
      identity: binding.identity,
      configurationSet: binding.configurationSet,
      accountId,
      region,
      email,
      wsId,
      eventType: 'bounce',
      bounceType: 'hard',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('passes complaint feedback without inventing a bounce type', async () => {
    const event = bounceEvent();
    const response = await handleAppealFeedback(
      request(
        envelope({
          eventType: 'Complaint',
          mail: event.mail,
          complaint: { complainedRecipients: [{ emailAddress: email }] },
        })
      ),
      dependenciesWithRecord()
    );
    expect(response.status).toBe(200);
  });

  function dependenciesWithRecord() {
    const deps = dependencies();
    deps.record.mockImplementation(async (input) => {
      expect(input.eventType).toBe('complaint');
      expect(input.bounceType).toBeNull();
      return 'recorded';
    });
    return deps;
  }

  it('does no certificate or record work while unconfigured', async () => {
    const deps = dependencies();
    expect(
      (
        await handleAppealFeedback(request(envelope()), {
          ...deps,
          bindings: [],
        })
      ).status
    ).toBe(503);
    expect(
      (await handleAppealFeedback(request(envelope()), { ...deps, topics: [] }))
        .status
    ).toBe(503);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it.each([
    'arn:aws:sns:ap-southeast-1:123456789012:other-topic',
    'arn:aws:sns:ap-southeast-1:999999999999:appeal-feedback',
    'arn:aws:sns:us-east-1:123456789012:appeal-feedback',
  ])(
    'rejects an unpinned topic/account/region before certificate access: %s',
    async (TopicArn) => {
      const deps = dependencies();
      expect(
        (
          await handleAppealFeedback(
            request(envelope(undefined, { TopicArn })),
            deps
          )
        ).status
      ).toBe(403);
      expect(deps.authenticate).not.toHaveBeenCalled();
      expect(deps.record).not.toHaveBeenCalled();
    }
  );

  it('rejects forged signatures and signed-message tampering', async () => {
    const deps = dependencies();
    const forged = envelope();
    forged.Signature = Buffer.from('forged').toString('base64');
    expect((await handleAppealFeedback(request(forged), deps)).status).toBe(
      401
    );
    const modified = envelope();
    modified.Message = JSON.stringify({
      ...bounceEvent(),
      eventType: 'Complaint',
    });
    expect((await handleAppealFeedback(request(modified), deps)).status).toBe(
      401
    );
    expect(deps.record).not.toHaveBeenCalled();
  });

  it.each([
    { SignatureVersion: '1' },
    { Timestamp: new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString() },
    { Timestamp: new Date(now + 5 * 60 * 1000 + 1).toISOString() },
    {
      SigningCertURL:
        'https://sns.ap-southeast-1.amazonaws.com.evil.example/SimpleNotificationService-fixture.pem',
    },
    {
      SigningCertURL:
        'http://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-fixture.pem',
    },
  ])(
    'refuses unsafe signing inputs without certificate fetch: %s',
    async (overrides) => {
      const deps = dependencies();
      expect(
        (
          await handleAppealFeedback(
            request(envelope(undefined, overrides)),
            deps
          )
        ).status
      ).toBe(401);
      expect(deps.fetchCertificate).not.toHaveBeenCalled();
      expect(deps.record).not.toHaveBeenCalled();
    }
  );

  it.each(['sendingAccountId', 'sourceArn', 'source', 'configurationSet'])(
    'rejects a signed event with wrong %s',
    async (field) => {
      const event = bounceEvent();
      if (field === 'sendingAccountId')
        event.mail.sendingAccountId = '999999999999';
      if (field === 'sourceArn')
        event.mail.sourceArn = `arn:aws:ses:${region}:999999999999:identity/example.org`;
      if (field === 'source') event.mail.source = 'other@example.org';
      if (field === 'configurationSet')
        event.mail.tags['ses:configuration-set'] = ['other'];
      const deps = dependencies();
      expect(
        (await handleAppealFeedback(request(envelope(event)), deps)).status
      ).toBe(403);
      expect(deps.record).not.toHaveBeenCalled();
    }
  );

  it('accepts a separately approved report stream and rejects unapproved or mixed stream fields', async () => {
    const deps = dependencies();
    const reportBinding = {
      ...binding,
      identity: 'reports@example.org',
      configurationSet: 'workspace-reports',
    };
    const approved = { ...deps, bindings: [binding, reportBinding] };
    const event = bounceEvent();
    event.mail.source = reportBinding.identity;
    event.mail.tags.appeal_dispatch_kind = ['report'];
    event.mail.tags['ses:configuration-set'] = [reportBinding.configurationSet];
    const response = await handleAppealFeedback(
      request(envelope(event)),
      approved
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'recorded' });
    deps.record.mockClear();
    expect(
      (await handleAppealFeedback(request(envelope(event)), deps)).status
    ).toBe(403);
    event.mail.tags['ses:configuration-set'] = [binding.configurationSet];
    expect(
      (await handleAppealFeedback(request(envelope(event)), approved)).status
    ).toBe(403);
    event.mail.tags['ses:configuration-set'] = ['unapproved-report-set'];
    expect(
      (await handleAppealFeedback(request(envelope(event)), approved)).status
    ).toBe(403);
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('rejects recipient mismatch, multi-recipient sends and missing binding tags', async () => {
    const deps = dependencies();
    const mismatched = bounceEvent();
    mismatched.mail.destination = ['other@example.com'];
    expect(
      (await handleAppealFeedback(request(envelope(mismatched)), deps)).status
    ).toBe(400);
    const multiple = bounceEvent();
    multiple.mail.destination.push('other@example.com');
    expect(
      (await handleAppealFeedback(request(envelope(multiple)), deps)).status
    ).toBe(400);
    const missing = bounceEvent();
    missing.mail.tags.appeal_id = [];
    expect(
      (await handleAppealFeedback(request(envelope(missing)), deps)).status
    ).toBe(400);
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('serializes concurrent duplicate event disposition without leaking event content', async () => {
    const deps = dependencies();
    const seen = new Set<string>();
    deps.record.mockImplementation(async ({ eventId }) => {
      if (seen.has(eventId)) return 'duplicate';
      seen.add(eventId);
      return 'recorded';
    });
    const responses = await Promise.all([
      handleAppealFeedback(request(envelope()), deps),
      handleAppealFeedback(request(envelope()), deps),
    ]);
    expect(await Promise.all(responses.map((r) => r.json()))).toEqual([
      { status: 'recorded' },
      { status: 'duplicate' },
    ]);
    expect(deps.record).toHaveBeenCalledTimes(2);
  });

  it.each(['appeal_dispatch_id', 'appeal_dispatch_kind'] as const)(
    'rejects a signed event without its durable %s tag',
    async (field) => {
      const event = bounceEvent();
      event.mail.tags[field] = [];
      const deps = dependencies();
      expect(
        (await handleAppealFeedback(request(envelope(event)), deps)).status
      ).toBe(400);
      expect(deps.record).not.toHaveBeenCalled();
    }
  );

  it('keeps store uncertainty unavailable and stored-claim mismatch invalid', async () => {
    const deps = dependencies();
    deps.record.mockResolvedValueOnce('invalid');
    const invalid = await handleAppealFeedback(request(envelope()), deps);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ status: 'invalid' });
    deps.record.mockRejectedValueOnce(new Error('unavailable'));
    expect((await handleAppealFeedback(request(envelope()), deps)).status).toBe(
      503
    );
  });

  it('does not fetch subscription URLs or certificates for subscription confirmation', async () => {
    const deps = dependencies();
    const response = await handleAppealFeedback(
      request(
        envelope(undefined, {
          Type: 'SubscriptionConfirmation',
          SubscribeURL: 'https://example.org/forbidden',
        })
      ),
      deps
    );
    expect(response.status).toBe(503);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('bounds actual streamed bytes independently of Content-Length', async () => {
    const deps = dependencies();
    const oversized = new Request(
      'https://example.org/api/v1/webhooks/email/appeals',
      {
        method: 'POST',
        headers: { 'Content-Length': '1' },
        body: 'x'.repeat(APPEAL_FEEDBACK_MAX_BYTES + 1),
      }
    );
    expect((await handleAppealFeedback(oversized, deps)).status).toBe(413);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });
});
