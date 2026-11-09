import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createSnsVerifier,
  SNS_CERTIFICATE_CACHE_SIZE,
  snsSigningPayload,
  type SnsEnvelope,
} from './feedback-sns';

const now = Date.parse('2026-11-09T12:00:00Z');
const host = 'sns.ap-southeast-1.amazonaws.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
function message(certificate = 'fixture'): SnsEnvelope {
  const value: SnsEnvelope = {
    Type: 'Notification',
    MessageId: 'synthetic-event',
    Message: '{}',
    TopicArn: 'arn:aws:sns:ap-southeast-1:123456789012:appeals',
    Timestamp: new Date(now).toISOString(),
    SignatureVersion: '2',
    Signature: 'unsigned',
    SigningCertURL: `https://${host}/SimpleNotificationService-${certificate}.pem`,
  };
  value.Signature = sign(
    'RSA-SHA256',
    Buffer.from(snsSigningPayload(value)),
    privateKey
  ).toString('base64');
  return value;
}
function certificate() {
  return {
    publicKey,
    validFrom: new Date(now - 1000).toISOString(),
    validTo: new Date(now + 1000).toISOString(),
    issuer: 'O=Amazon',
    checkHost: (name: string) => (name === host ? name : undefined),
  };
}

describe('appeal SNS verifier inherited trust boundaries', () => {
  it.each(['issuer', 'hostname', 'expired', 'not_yet_valid'])(
    'refuses untrusted certificate %s',
    async (invalid) => {
      const value = certificate();
      if (invalid === 'issuer') value.issuer = 'O=Untrusted';
      if (invalid === 'hostname') value.checkHost = () => undefined;
      if (invalid === 'expired')
        value.validTo = new Date(now - 1).toISOString();
      if (invalid === 'not_yet_valid')
        value.validFrom = new Date(now + 1).toISOString();
      const verify = createSnsVerifier({
        now: () => now,
        fetchCertificate: async () => 'synthetic-pem',
        parseCertificate: () => value,
      });
      expect(await verify(message())).toBe('invalid');
    }
  );

  it('keeps transient certificate errors unavailable and does not cache them', async () => {
    const fetchCertificate = vi.fn(async () => {
      throw new Error('transient');
    });
    const verify = createSnsVerifier({
      now: () => now,
      fetchCertificate,
      parseCertificate: certificate,
    });
    expect(await verify(message())).toBe('unavailable');
    expect(await verify(message())).toBe('unavailable');
    expect(fetchCertificate).toHaveBeenCalledTimes(2);
  });

  it('caps the certificate cache at 32 and evicts the oldest entry', async () => {
    const fetchCertificate = vi.fn(async () => 'synthetic-pem');
    const verify = createSnsVerifier({
      now: () => now,
      fetchCertificate,
      parseCertificate: certificate,
    });
    expect(SNS_CERTIFICATE_CACHE_SIZE).toBe(32);
    for (let index = 0; index <= SNS_CERTIFICATE_CACHE_SIZE; index++)
      expect(await verify(message(`fixture${index}`))).toBe('valid');
    expect(fetchCertificate).toHaveBeenCalledTimes(33);
    expect(await verify(message('fixture1'))).toBe('valid');
    expect(fetchCertificate).toHaveBeenCalledTimes(33);
    expect(await verify(message('fixture0'))).toBe('valid');
    expect(fetchCertificate).toHaveBeenCalledTimes(34);
  });
});
