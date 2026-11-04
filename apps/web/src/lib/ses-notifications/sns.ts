import { type KeyObject, verify as verifySignature } from 'node:crypto';
import { z } from 'zod';

export const snsEnvelopeSchema = z.object({
  Type: z.enum([
    'Notification',
    'SubscriptionConfirmation',
    'UnsubscribeConfirmation',
  ]),
  MessageId: z.string().min(1).max(128),
  TopicArn: z.string().min(1).max(256),
  Message: z.string(),
  Timestamp: z.string().min(1).max(64),
  SignatureVersion: z.string().max(8),
  Signature: z.string().min(1).max(4096),
  SigningCertURL: z.string().min(1).max(2048),
  Subject: z.string().max(1024).optional(),
  SubscribeURL: z.string().max(4096).optional(),
  Token: z.string().max(4096).optional(),
});

export type SnsEnvelope = z.infer<typeof snsEnvelopeSchema>;

/** The parts of node:crypto's X509Certificate the verifier relies on. */
export interface SigningCertificate {
  publicKey: KeyObject;
  validFrom: string;
  validTo: string;
  issuer: string;
  checkHost(name: string): string | undefined;
}

const TOPIC_ARN =
  /^arn:aws:sns:([a-z]{2}(?:-[a-z]+)+-\d):\d{12}:[A-Za-z0-9_-]{1,256}$/;
const CERT_PATH = /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** The region of a commercial-partition SNS topic, or null. */
export function snsTopicRegion(topicArn: string) {
  return TOPIC_ARN.exec(topicArn)?.[1] ?? null;
}

function snsHost(topicArn: string) {
  const region = snsTopicRegion(topicArn);
  return region ? `sns.${region}.amazonaws.com` : null;
}

/** A bare https URL on exactly the topic's regional SNS host. */
function regionalSnsUrl(value: string | undefined, topicArn: string) {
  const host = snsHost(topicArn);
  if (!host || !value) return null;
  try {
    const url = new URL(value);
    const bare =
      url.protocol === 'https:' &&
      url.hostname === host &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '';
    return bare ? url : null;
  } catch {
    return null;
  }
}

/** SNS's canonical string to sign, per message type. */
export function snsSigningPayload(envelope: SnsEnvelope) {
  const keys =
    envelope.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : [
          'Message',
          'MessageId',
          'SubscribeURL',
          'Timestamp',
          'Token',
          'TopicArn',
          'Type',
        ];
  return keys
    .map((key) => [key, envelope[key as keyof SnsEnvelope]] as const)
    .filter(
      (entry): entry is readonly [string, string] =>
        typeof entry[1] === 'string'
    )
    .map(([key, value]) => `${key}\n${value}\n`)
    .join('');
}

function trustedCertificate(
  certificate: SigningCertificate,
  topicArn: string,
  now: number
) {
  const host = snsHost(topicArn);
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  return (
    Number.isFinite(validFrom) &&
    Number.isFinite(validTo) &&
    validFrom <= now &&
    now <= validTo &&
    /(^|\n)O=Amazon(\n|$)/.test(certificate.issuer) &&
    Boolean(
      certificate.checkHost('sns.amazonaws.com') ||
        (host && certificate.checkHost(host))
    )
  );
}

export interface SnsVerifierDeps {
  fetchCertificate(url: URL): Promise<string | null>;
  parseCertificate(pem: string): SigningCertificate;
  now(): number;
}

/**
 * Verifies an SNS message signature: SignatureVersion 2 (RSA-SHA256) only,
 * a fresh timestamp, a signing certificate URL on the topic's own regional
 * host sns.<region>.amazonaws.com, and a certificate that is in date, issued
 * by Amazon and valid for the SNS host. Certificates are cached per URL.
 */
export function createSnsVerifier(deps: SnsVerifierDeps) {
  const certificates = new Map<string, Promise<string | null>>();

  return async function verifySnsEnvelope(envelope: SnsEnvelope) {
    if (envelope.SignatureVersion !== '2') return false;
    const now = deps.now();
    const sentAt = Date.parse(envelope.Timestamp);
    if (
      !Number.isFinite(sentAt) ||
      now - sentAt > MAX_AGE_MS ||
      sentAt - now > MAX_CLOCK_SKEW_MS
    )
      return false;

    const certUrl = regionalSnsUrl(envelope.SigningCertURL, envelope.TopicArn);
    if (certUrl?.search !== '' || !CERT_PATH.test(certUrl.pathname))
      return false;

    let pending = certificates.get(certUrl.href);
    if (!pending) {
      pending = deps.fetchCertificate(certUrl).catch(() => null);
      certificates.set(certUrl.href, pending);
    }
    const pem = await pending;
    if (!pem) {
      certificates.delete(certUrl.href);
      return false;
    }

    try {
      const certificate = deps.parseCertificate(pem);
      if (!trustedCertificate(certificate, envelope.TopicArn, now))
        return false;
      return verifySignature(
        'RSA-SHA256',
        Buffer.from(snsSigningPayload(envelope), 'utf8'),
        certificate.publicKey,
        Buffer.from(envelope.Signature, 'base64')
      );
    } catch {
      return false;
    }
  };
}

/**
 * The SubscribeURL of a subscription confirmation, only when it is the
 * topic's regional SNS ConfirmSubscription call for that same topic.
 */
export function trustedSubscribeUrl(envelope: SnsEnvelope) {
  const url = regionalSnsUrl(envelope.SubscribeURL, envelope.TopicArn);
  if (url?.pathname !== '/') return null;
  const params = url.searchParams;
  return params.get('Action') === 'ConfirmSubscription' &&
    params.get('TopicArn') === envelope.TopicArn &&
    params.get('Token')
    ? url
    : null;
}
