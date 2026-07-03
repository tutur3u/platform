import { createVerify } from 'node:crypto';
import type { SesNotification, SnsEnvelope } from './types';

const SNS_SIGNING_CERT_PATH_REGEX =
  /^\/SimpleNotificationService-([A-Za-z0-9]+)\.pem$/u;
const SNS_TOPIC_ARN_REGEX =
  /^arn:(aws|aws-cn|aws-us-gov):sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9-_]+$/u;

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

function getConfiguredTopicArn() {
  const value = process.env.MAIL_SES_INBOUND_TOPIC_ARN?.trim();
  return value || null;
}

function getSigningCertOriginFromTopicArn(topicArn: string) {
  const match = SNS_TOPIC_ARN_REGEX.exec(topicArn);
  if (!match) {
    return null;
  }

  const [, partition, region] = match;
  if (!partition || !region) {
    return null;
  }

  const domain = partition === 'aws-cn' ? 'amazonaws.com.cn' : 'amazonaws.com';

  return `https://sns.${region}.${domain}`;
}

function getTrustedSigningCertUrl(value: string, expectedTopicArn: string) {
  const expectedOrigin = getSigningCertOriginFromTopicArn(expectedTopicArn);
  if (!expectedOrigin) {
    return null;
  }

  try {
    const url = new URL(value);
    const pathMatch = SNS_SIGNING_CERT_PATH_REGEX.exec(url.pathname);

    if (
      url.origin !== expectedOrigin ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      !pathMatch?.[1]
    ) {
      return null;
    }

    return new URL(
      `/SimpleNotificationService-${encodeURIComponent(pathMatch[1])}.pem`,
      expectedOrigin
    );
  } catch {
    return null;
  }
}

export async function verifySnsEnvelope(envelope: SnsEnvelope) {
  const expectedTopicArn = getConfiguredTopicArn();
  if (expectedTopicArn && envelope.TopicArn !== expectedTopicArn) {
    return false;
  }

  if (process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION === 'disabled') {
    return true;
  }

  if (!expectedTopicArn) {
    return false;
  }

  const signingCertUrl = getTrustedSigningCertUrl(
    envelope.SigningCertURL,
    expectedTopicArn
  );

  if (!signingCertUrl) {
    return false;
  }

  const certificate = await fetch(signingCertUrl, { redirect: 'error' }).then(
    (response) => (response.ok ? response.text() : null)
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
