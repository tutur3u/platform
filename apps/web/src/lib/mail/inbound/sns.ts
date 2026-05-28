import { createVerify } from 'node:crypto';
import type { SesNotification, SnsEnvelope } from './types';

const SNS_SIGNING_CERT_HOST_REGEX =
  /^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/iu;
const SNS_SIGNING_CERT_PATH_REGEX =
  /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/u;

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

function isTrustedSigningCertUrl(value: string) {
  try {
    const url = new URL(value);
    const isTrustedSnsHost =
      url.hostname === 'sns.amazonaws.com' ||
      SNS_SIGNING_CERT_HOST_REGEX.test(url.hostname);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.search === '' &&
      url.hash === '' &&
      isTrustedSnsHost &&
      SNS_SIGNING_CERT_PATH_REGEX.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function verifySnsEnvelope(envelope: SnsEnvelope) {
  const expectedTopicArn = process.env.MAIL_SES_INBOUND_TOPIC_ARN;
  if (expectedTopicArn && envelope.TopicArn !== expectedTopicArn) {
    return false;
  }

  if (process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION === 'disabled') {
    return true;
  }

  if (!isTrustedSigningCertUrl(envelope.SigningCertURL)) {
    return false;
  }

  const certificate = await fetch(envelope.SigningCertURL).then((response) =>
    response.ok ? response.text() : null
  );

  if (!certificate) {
    return false;
  }

  const algorithm =
    envelope.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  const verifier = createVerify(algorithm);
  verifier.update(getSigningPayload(envelope), 'utf8');

  return verifier.verify(certificate, envelope.Signature, 'base64');
}

export function parseSnsEnvelope(rawBody: string) {
  const envelope = JSON.parse(rawBody) as SnsEnvelope;
  return {
    envelope,
    notification: JSON.parse(envelope.Message) as SesNotification,
  };
}
