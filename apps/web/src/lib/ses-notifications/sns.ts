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
  /**
   * Resolves the PEM, or null when the certificate definitively does not
   * exist (4xx, not a certificate). Throws on a transient failure.
   */
  fetchCertificate(url: URL): Promise<string | null>;
  parseCertificate(pem: string): SigningCertificate;
  now(): number;
}

/**
 * 'invalid' is a real verification failure (401). 'unavailable' means the
 * signing certificate could not be fetched right now (5xx, so SNS retries).
 */
export type SnsVerification = 'valid' | 'invalid' | 'unavailable';

export const SNS_CERTIFICATE_CACHE_SIZE = 32;

/**
 * Verifies an SNS message signature: SignatureVersion 2 (RSA-SHA256) only,
 * a fresh timestamp, a signing certificate URL on the topic's own regional
 * host sns.<region>.amazonaws.com, and a certificate that is in date, issued
 * by Amazon and valid for the SNS host. Fetched certificates are kept in a
 * small least-recently-used cache; failures are never cached.
 */
export function createSnsVerifier(deps: SnsVerifierDeps) {
  const certificates = new Map<string, Promise<string | null>>();

  const certificate = (url: URL) => {
    const cached = certificates.get(url.href);
    if (cached) {
      certificates.delete(url.href);
      certificates.set(url.href, cached);
      return cached;
    }
    const pending = deps.fetchCertificate(url);
    certificates.set(url.href, pending);
    pending.then(
      (pem) => {
        if (pem === null) certificates.delete(url.href);
      },
      () => certificates.delete(url.href)
    );
    while (certificates.size > SNS_CERTIFICATE_CACHE_SIZE) {
      const oldest = certificates.keys().next().value;
      if (oldest === undefined) break;
      certificates.delete(oldest);
    }
    return pending;
  };

  return async function verifySnsEnvelope(
    envelope: SnsEnvelope
  ): Promise<SnsVerification> {
    if (envelope.SignatureVersion !== '2') return 'invalid';
    const now = deps.now();
    const sentAt = Date.parse(envelope.Timestamp);
    if (
      !Number.isFinite(sentAt) ||
      now - sentAt > MAX_AGE_MS ||
      sentAt - now > MAX_CLOCK_SKEW_MS
    )
      return 'invalid';

    const certUrl = regionalSnsUrl(envelope.SigningCertURL, envelope.TopicArn);
    if (certUrl?.search !== '' || !CERT_PATH.test(certUrl.pathname))
      return 'invalid';

    let pem: string | null;
    try {
      pem = await certificate(certUrl);
    } catch {
      return 'unavailable';
    }
    if (!pem) return 'invalid';

    try {
      const parsed = deps.parseCertificate(pem);
      if (!trustedCertificate(parsed, envelope.TopicArn, now)) return 'invalid';
      return verifySignature(
        'RSA-SHA256',
        Buffer.from(snsSigningPayload(envelope), 'utf8'),
        parsed.publicKey,
        Buffer.from(envelope.Signature, 'base64')
      )
        ? 'valid'
        : 'invalid';
    } catch {
      return 'invalid';
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
