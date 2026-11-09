// @vitest-environment node
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSnsVerifier,
  type SigningCertificate,
  type SnsEnvelope,
  snsSigningPayload,
  trustedSubscribeUrl,
} from './sns';

const TOPIC = 'arn:aws:sns:ap-southeast-1:123456789012:ses-events';
const CERT_URL =
  'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-0123456789abcdef.pem';
const NOW = Date.parse('2026-11-11T03:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

function certificate(
  overrides: Partial<SigningCertificate> = {},
  key: KeyObject = publicKey
): SigningCertificate {
  return {
    publicKey: key,
    validFrom: 'Jan  1 00:00:00 2026 GMT',
    validTo: 'Jan  1 00:00:00 2027 GMT',
    issuer: 'C=US\nO=Amazon\nCN=Amazon RSA 2048 M01',
    checkHost: (name) => (name === 'sns.amazonaws.com' ? name : undefined),
    ...overrides,
  };
}

function sign(envelope: Omit<SnsEnvelope, 'Signature'>): SnsEnvelope {
  const signer = createSign('RSA-SHA256');
  signer.update(snsSigningPayload(envelope as SnsEnvelope), 'utf8');
  return { ...envelope, Signature: signer.sign(privateKey, 'base64') };
}

function notification(overrides: Partial<SnsEnvelope> = {}) {
  return sign({
    Type: 'Notification',
    MessageId: 'sns-message-1',
    TopicArn: TOPIC,
    Message: '{"notificationType":"Bounce"}',
    Timestamp: '2026-11-11T02:59:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: CERT_URL,
    ...overrides,
  });
}

function verifier(cert = certificate()) {
  const fetchCertificate = vi.fn(async () => 'PEM');
  const verify = createSnsVerifier({
    fetchCertificate,
    parseCertificate: () => cert,
    now: () => NOW,
  });
  return { verify, fetchCertificate };
}

describe('SNS signature verification', () => {
  it('accepts a correctly signed SignatureVersion 2 notification', async () => {
    const { verify, fetchCertificate } = verifier();
    expect(await verify(notification())).toBe('valid');
    expect(fetchCertificate).toHaveBeenCalledWith(new URL(CERT_URL));
  });

  it('accepts a signed subscription confirmation', async () => {
    const { verify } = verifier();
    const envelope = sign({
      Type: 'SubscriptionConfirmation',
      MessageId: 'sns-sub-1',
      TopicArn: TOPIC,
      Message: 'You have chosen to subscribe',
      Timestamp: '2026-11-11T02:59:00.000Z',
      SignatureVersion: '2',
      SigningCertURL: CERT_URL,
      SubscribeURL: `https://sns.ap-southeast-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=abc`,
      Token: 'abc',
    });
    expect(await verify(envelope)).toBe('valid');
  });

  it('rejects a tampered message', async () => {
    const { verify } = verifier();
    const envelope = notification();
    expect(
      await verify({ ...envelope, Message: '{"notificationType":"Complaint"}' })
    ).toBe('invalid');
  });

  it('rejects a signature from another key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { verify } = verifier(certificate({}, other.publicKey));
    expect(await verify(notification())).toBe('invalid');
  });

  it('rejects SignatureVersion 1 (SHA1)', async () => {
    const { verify, fetchCertificate } = verifier();
    expect(await verify(notification({ SignatureVersion: '1' }))).toBe(
      'invalid'
    );
    expect(fetchCertificate).not.toHaveBeenCalled();
  });

  it.each([
    'http://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-0123.pem',
    'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-0123.pem',
    'https://sns.ap-southeast-1.amazonaws.com.evil.example/SimpleNotificationService-0123.pem',
    'https://evil.example/SimpleNotificationService-0123.pem',
    'https://sns.ap-southeast-1.amazonaws.com:8443/SimpleNotificationService-0123.pem',
    'https://user@sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-0123.pem',
    'https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-0123.pem?x=1',
    'https://sns.ap-southeast-1.amazonaws.com/other/cert.pem',
    'not a url',
  ])('rejects an untrusted signing certificate URL: %s', async (url) => {
    const { verify, fetchCertificate } = verifier();
    expect(await verify(notification({ SigningCertURL: url }))).toBe('invalid');
    expect(fetchCertificate).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { validTo: 'Nov  1 00:00:00 2026 GMT' }],
    ['not yet valid', { validFrom: 'Dec  1 00:00:00 2026 GMT' }],
    ['issued for another host', { checkHost: () => undefined }],
    ['not issued by Amazon', { issuer: 'C=US\nO=Evil Corp\nCN=Evil CA' }],
  ])('rejects a signing certificate that is %s', async (_label, overrides) => {
    const { verify } = verifier(certificate(overrides));
    expect(await verify(notification())).toBe('invalid');
  });

  it('accepts a certificate issued for the regional SNS host', async () => {
    const { verify } = verifier(
      certificate({
        checkHost: (name) =>
          name === 'sns.ap-southeast-1.amazonaws.com' ? name : undefined,
      })
    );
    expect(await verify(notification())).toBe('valid');
  });

  it.each([
    ['older than a day', '2026-11-10T02:00:00.000Z'],
    ['in the future', '2026-11-11T03:10:00.000Z'],
    ['unparseable', 'yesterday'],
  ])('rejects a timestamp that is %s', async (_label, Timestamp) => {
    const { verify } = verifier();
    expect(await verify(notification({ Timestamp }))).toBe('invalid');
  });

  it('rejects a malformed topic ARN or a missing certificate', async () => {
    const { verify } = verifier();
    expect(await verify(notification({ TopicArn: 'arn:aws:sns:bad' }))).toBe(
      'invalid'
    );
    const missing = createSnsVerifier({
      fetchCertificate: async () => null,
      parseCertificate: () => certificate(),
      now: () => NOW,
    });
    expect(await missing(notification())).toBe('invalid');
  });

  it('fetches each signing certificate once', async () => {
    const { verify, fetchCertificate } = verifier();
    await verify(notification());
    await verify(notification({ MessageId: 'sns-message-2' }));
    expect(fetchCertificate).toHaveBeenCalledTimes(1);
  });
  it('reports a transient certificate fetch failure as unavailable, never invalid', async () => {
    const fetchCertificate = vi
      .fn<(url: URL) => Promise<string | null>>()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce('PEM');
    const verify = createSnsVerifier({
      fetchCertificate,
      parseCertificate: () => certificate(),
      now: () => NOW,
    });
    expect(await verify(notification())).toBe('unavailable');
    // The failure is not cached: the retry fetches again and verifies.
    expect(await verify(notification())).toBe('valid');
    expect(fetchCertificate).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 32 certificates, evicting the least recently used', async () => {
    const { verify, fetchCertificate } = verifier();
    const url = (n: number) =>
      `https://sns.ap-southeast-1.amazonaws.com/SimpleNotificationService-${n}.pem`;
    for (let n = 0; n < 33; n++)
      await verify(notification({ SigningCertURL: url(n) }));
    expect(fetchCertificate).toHaveBeenCalledTimes(33);
    await verify(notification({ SigningCertURL: url(32) }));
    expect(fetchCertificate).toHaveBeenCalledTimes(33);
    await verify(notification({ SigningCertURL: url(0) }));
    expect(fetchCertificate).toHaveBeenCalledTimes(34);
  });
});

describe('subscription confirmation URL', () => {
  const base = {
    Type: 'SubscriptionConfirmation' as const,
    MessageId: 'm',
    TopicArn: TOPIC,
    Message: 'm',
    Timestamp: '2026-11-11T02:59:00.000Z',
    SignatureVersion: '2',
    Signature: 's',
    SigningCertURL: CERT_URL,
    Token: 'abc',
  };
  const url = (host: string, query: string) => `https://${host}/?${query}`;
  const good = `Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=abc`;

  it('trusts only the regional SNS ConfirmSubscription URL for the same topic', () => {
    expect(
      trustedSubscribeUrl({
        ...base,
        SubscribeURL: url('sns.ap-southeast-1.amazonaws.com', good),
      })?.hostname
    ).toBe('sns.ap-southeast-1.amazonaws.com');
    for (const SubscribeURL of [
      url('sns.us-east-1.amazonaws.com', good),
      url('evil.example', good),
      url(
        'sns.ap-southeast-1.amazonaws.com',
        good.replace('ConfirmSubscription', 'Unsubscribe')
      ),
      url(
        'sns.ap-southeast-1.amazonaws.com',
        good.replace('ses-events', 'other-topic')
      ),
      `http://sns.ap-southeast-1.amazonaws.com/?${good}`,
      undefined,
    ]) {
      expect(trustedSubscribeUrl({ ...base, SubscribeURL })).toBeNull();
    }
  });
});
