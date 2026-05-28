import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSnsEnvelope, verifySnsEnvelope } from './sns';
import type { SesNotification, SnsEnvelope } from './types';

const originalTopicArn = process.env.MAIL_SES_INBOUND_TOPIC_ARN;
const originalSignatureVerification =
  process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const publicKeyPem = publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();

const notification: SesNotification = {
  mail: {
    destination: ['victim@tuturuuu.com'],
    messageId: 'ses-message-id',
    source: 'attacker@example.com',
    timestamp: '2026-05-28T15:00:00.000Z',
  },
  receipt: {
    action: {
      bucketName: 'attacker-controlled-mail-bucket',
      objectKey: 'raw/forged.eml',
      type: 'S3',
    },
    recipients: ['victim@tuturuuu.com'],
  },
};

function getSigningPayload(envelope: SnsEnvelope) {
  const entries =
    envelope.Type === 'SubscriptionConfirmation'
      ? [
          ['Message', envelope.Message],
          ['MessageId', envelope.MessageId],
          ['SubscribeURL', envelope.SubscribeURL],
          ['Timestamp', envelope.Timestamp],
          ['Token', envelope.Token],
          ['TopicArn', envelope.TopicArn],
          ['Type', envelope.Type],
        ]
      : [
          ['Message', envelope.Message],
          ['MessageId', envelope.MessageId],
          ...(envelope.Subject ? [['Subject', envelope.Subject]] : []),
          ['Timestamp', envelope.Timestamp],
          ['TopicArn', envelope.TopicArn],
          ['Type', envelope.Type],
        ];

  return entries
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${key}\n${value}\n`)
    .join('');
}

function createSignedEnvelope(signingCertURL: string): SnsEnvelope {
  const envelope: SnsEnvelope = {
    Message: JSON.stringify(notification),
    MessageId: 'sns-message-id',
    Signature: '',
    SignatureVersion: '2',
    SigningCertURL: signingCertURL,
    Timestamp: '2026-05-28T15:00:00.000Z',
    TopicArn: 'arn:aws:sns:us-west-2:123456789012:tuturuuu-mail-inbound',
    Type: 'Notification',
  };

  const signer = createSign('RSA-SHA256');
  signer.update(getSigningPayload(envelope), 'utf8');
  envelope.Signature = signer.sign(privateKey, 'base64');

  return envelope;
}

function stubCertificateFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    text: async () => publicKeyPem,
  }));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('verifySnsEnvelope', () => {
  beforeEach(() => {
    delete process.env.MAIL_SES_INBOUND_TOPIC_ARN;
    delete process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;
  });

  afterEach(() => {
    if (originalTopicArn === undefined) {
      delete process.env.MAIL_SES_INBOUND_TOPIC_ARN;
    } else {
      process.env.MAIL_SES_INBOUND_TOPIC_ARN = originalTopicArn;
    }

    if (originalSignatureVerification === undefined) {
      delete process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;
    } else {
      process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION =
        originalSignatureVerification;
    }

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects attacker-controlled S3 PEM URLs before fetching them', async () => {
    const fetchMock = stubCertificateFetch();
    const envelope = createSignedEnvelope(
      'https://s3.amazonaws.com/attacker-bucket/attacker-cert.pem'
    );

    await expect(verifySnsEnvelope(envelope)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem',
    'https://sns.us-west-2.amazonaws.com.evil.example/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem',
    'https://sns.us-west-2.amazonaws.com/attacker-cert.pem',
    'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem?bucket=attacker',
    'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem#attacker',
  ])('rejects non-SNS signing certificate URL %s', async (signingCertURL) => {
    const fetchMock = stubCertificateFetch();
    const envelope = createSignedEnvelope(signingCertURL);

    await expect(verifySnsEnvelope(envelope)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the current AWS SNS signing certificate URL shape', async () => {
    const fetchMock = stubCertificateFetch();
    const envelope = createSignedEnvelope(
      'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem'
    );

    await expect(verifySnsEnvelope(envelope)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(envelope.SigningCertURL);
  });

  it('keeps parsing the SES notification from the SNS envelope message', () => {
    const envelope = createSignedEnvelope(
      'https://sns.us-west-2.amazonaws.com/SimpleNotificationService-f3ecfb7224c7233fe7bb5f59f96de52f.pem'
    );

    expect(parseSnsEnvelope(JSON.stringify(envelope))).toEqual({
      envelope,
      notification,
    });
  });
});
