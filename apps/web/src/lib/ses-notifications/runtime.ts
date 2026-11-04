import 'server-only';

import { X509Certificate } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveClientIp } from '@tuturuuu/utils/abuse-protection/client-ip';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import type { SesNotificationDeps, SesNotificationRecord } from './handler';
import { createSnsVerifier, snsTopicRegion } from './sns';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_CERTIFICATE_BYTES = 16 * 1024;
const RATE_LIMIT = { windowMs: 60_000, maxRequests: 300 };

/** SES_NOTIFICATIONS_TOPIC_ARNS: comma-separated SNS topic ARNs to accept. */
export function configuredTopicArns(
  value = process.env.SES_NOTIFICATIONS_TOPIC_ARNS
) {
  return (value ?? '')
    .split(',')
    .map((arn) => arn.trim())
    .filter((arn) => snsTopicRegion(arn) !== null);
}

async function fetchCertificate(url: URL) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const pem = await response.text();
  return pem.length <= MAX_CERTIFICATE_BYTES &&
    pem.startsWith('-----BEGIN CERTIFICATE-----')
    ? pem
    : null;
}

// One verifier per server instance, so signing certificates are cached.
const verify = createSnsVerifier({
  fetchCertificate,
  parseCertificate: (pem) => new X509Certificate(pem),
  now: () => Date.now(),
});

async function record(input: SesNotificationRecord) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  // The private recorder is not in the generated public types.
  const { data, error } = (await sbAdmin.schema('private').rpc(
    'record_ses_notification' as never,
    {
      p_sns_message_id: input.snsMessageId,
      p_topic_arn: input.topicArn,
      p_kind: input.kind,
      p_bounce_type: input.bounceType,
      p_detail: input.detail,
      p_ses_message_id: input.sesMessageId,
      p_recipients: input.recipients,
    } as never
  )) as { data: unknown; error: { message?: string } | null };
  if (error) throw new Error('record_ses_notification failed');
  if (data !== 'recorded' && data !== 'duplicate')
    throw new Error('record_ses_notification returned an unexpected result');
  return data;
}

export function createSesNotificationDeps(): SesNotificationDeps {
  return {
    topicArns: configuredTopicArns(),
    verify,
    confirmSubscription: async (url) => {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return response.ok;
    },
    record,
    allowRequest: async (ip) =>
      (await checkRateLimitRedis(`ses-notifications:${ip}`, RATE_LIMIT))
        .allowed,
    clientIp: (request) => resolveClientIp(request.headers),
  };
}
