import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { EmailService } from '@tuturuuu/email-service';
import type {
  ReportEmailReplyIdentity,
  ReportEmailReplyLease,
  ReportEmailReplyRpc,
  ReportEmailReplyScope,
} from './email-reply-types';

const TOKEN = /^[0-9a-f]{48}$/;
const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const HEX = /^[0-9a-f]+$/;

function aad(scope: ReportEmailReplyScope) {
  // Ordered tuple; no delimiter ambiguity or mutable queue fields.
  return Buffer.from(
    JSON.stringify([
      'report-email-reply:v1',
      scope.ws_id,
      scope.report_id,
      scope.subject_user_id,
      scope.queue_id,
      scope.generation,
      scope.review_revision,
      scope.recipient_email,
      scope.delivery_kind,
      scope.reply_domain,
      scope.content_sha256,
      scope.key_version,
    ])
  );
}

export function reportEmailContentDigest(subject: string, html: string) {
  return createHash('sha256')
    .update(JSON.stringify([subject, html]))
    .digest('hex');
}

export function reportReplyTokenDigest(token: string) {
  if (!TOKEN.test(token)) throw new Error('Invalid report reply token');
  return createHash('sha256').update(token, 'ascii').digest('hex');
}

function validateScope(scope: ReportEmailReplyScope, key: Uint8Array) {
  if (
    key.byteLength !== 32 ||
    !Number.isSafeInteger(scope.key_version) ||
    scope.key_version < 1 ||
    !Number.isSafeInteger(scope.review_revision) ||
    scope.review_revision < 1 ||
    !DOMAIN.test(scope.reply_domain) ||
    !/^[0-9a-f]{64}$/.test(scope.content_sha256) ||
    scope.recipient_email !== scope.recipient_email.trim().toLowerCase() ||
    !scope.recipient_email ||
    /[\r\n]/.test(scope.recipient_email)
  ) {
    throw new Error('Invalid report reply identity configuration');
  }
}

export function encryptReportReplyToken(
  scope: ReportEmailReplyScope,
  key: Uint8Array
) {
  validateScope(scope, key);
  const token = randomBytes(24).toString('hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([
    cipher.update(token, 'ascii'),
    cipher.final(),
  ]);
  return {
    token_digest: `\\x${reportReplyTokenDigest(token)}`,
    token_ciphertext: `\\x${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('hex')}`,
  };
}

export function reconstructReportReplyAddress(
  identity: ReportEmailReplyIdentity,
  key: Uint8Array
) {
  validateScope(identity, key);
  const encoded = identity.token_ciphertext.replace(/^\\x/, '');
  if (encoded.length !== 152 || !HEX.test(encoded))
    throw new Error('Invalid report reply ciphertext');
  const bytes = Buffer.from(encoded, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAAD(aad(identity));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const token = Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString('ascii');
  const digest = reportReplyTokenDigest(token);
  const stored = identity.token_digest.replace(/^\\x/, '');
  if (
    !/^[0-9a-f]{64}$/.test(stored) ||
    !timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(stored, 'hex'))
  ) {
    throw new Error('Invalid report reply token digest');
  }
  return `r-${token}@${identity.reply_domain}`;
}

/** P1 SQL returns false unconditionally. Environment flags cannot manufacture a receiver. */
export async function reportReplyReceivingReady(rpc: ReportEmailReplyRpc) {
  const { data, error } = await rpc('report_email_reply_receiving_ready', {});
  return !error && data === true;
}

export async function reserveReportReplyIdentity(
  rpc: ReportEmailReplyRpc,
  lease: ReportEmailReplyLease,
  config: { domain: string; keyVersion: number; key: Uint8Array },
  contentDigest: string
): Promise<ReportEmailReplyIdentity> {
  const scope: ReportEmailReplyScope = {
    ws_id: lease.wsId,
    report_id: lease.reportId,
    subject_user_id: lease.subjectUserId,
    queue_id: lease.queueId,
    generation: randomUUID(),
    review_revision: lease.reviewRevision,
    recipient_email: lease.recipient.trim().toLowerCase(),
    delivery_kind: lease.deliveryKind,
    reply_domain: config.domain,
    key_version: config.keyVersion,
    content_sha256: contentDigest,
  };
  const candidate = encryptReportReplyToken(scope, config.key);
  const { data, error } = await rpc('reserve_report_email_reply_identity', {
    p_queue_id: lease.queueId,
    p_ws_id: lease.wsId,
    p_report_id: lease.reportId,
    p_subject_user_id: lease.subjectUserId,
    p_worker_id: lease.workerId,
    p_locked_at: lease.lockedAt,
    p_recipient_email: scope.recipient_email,
    p_review_revision: scope.review_revision,
    p_delivery_kind: scope.delivery_kind,
    p_generation: scope.generation,
    p_token_digest: candidate.token_digest,
    p_token_ciphertext: candidate.token_ciphertext,
    p_key_version: config.keyVersion,
    p_reply_domain: config.domain,
    p_content_sha256: contentDigest,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Report reply identity reservation failed');
  const identity = data as ReportEmailReplyIdentity;
  // Validate returned scope before reconstructing an existing retry token.
  for (const field of [
    'ws_id',
    'report_id',
    'subject_user_id',
    'queue_id',
    'review_revision',
    'recipient_email',
    'delivery_kind',
    'content_sha256',
  ] as const) {
    if (identity[field] !== scope[field])
      throw new Error('Report reply identity scope mismatch');
  }
  if (
    identity.key_version !== config.keyVersion ||
    identity.reply_domain !== config.domain
  )
    throw new Error('Report reply identity key/domain changed');
  reconstructReportReplyAddress(identity, config.key);
  return identity;
}

export async function recordReportReplyOutcome(
  rpc: ReportEmailReplyRpc,
  identity: ReportEmailReplyIdentity,
  lease: ReportEmailReplyLease,
  outcome:
    | 'submitting'
    | 'rejected'
    | 'accepted'
    | 'outcome_unknown'
    | 'application_sent',
  providerMessageId?: string
) {
  const { data, error } = await rpc('transition_report_email_reply_identity', {
    p_identity_id: identity.id,
    p_ws_id: lease.wsId,
    p_worker_id: lease.workerId,
    p_locked_at: lease.lockedAt,
    p_outcome: outcome,
    p_provider_message_id: providerMessageId ?? null,
  });
  if (
    error ||
    !data ||
    typeof data !== 'object' ||
    (data as ReportEmailReplyIdentity).id !== identity.id ||
    (data as ReportEmailReplyIdentity).ws_id !== lease.wsId ||
    (data as ReportEmailReplyIdentity).outcome !== outcome
  )
    throw new Error('Report reply outcome persistence failed');
}

type SendOptions = Parameters<EmailService['send']>[0];

/** Inert until a later receiver implementation replaces the false SQL readiness contract. */
export async function sendReportEmail(
  service: Pick<EmailService, 'send'>,
  options: SendOptions,
  rpc: ReportEmailReplyRpc,
  lease: ReportEmailReplyLease
) {
  if (
    process.env.REPORT_EMAIL_REPLY_IDENTITY_ENABLED !== 'true' ||
    !(await reportReplyReceivingReady(rpc))
  ) {
    return { sendResult: await service.send(options) };
  }
  const encodedKey = process.env.REPORT_EMAIL_REPLY_IDENTITY_KEY;
  const domain = process.env.REPORT_EMAIL_REPLY_DOMAIN ?? '';
  const keyVersion = Number(
    process.env.REPORT_EMAIL_REPLY_IDENTITY_KEY_VERSION
  );
  if (!encodedKey || !/^[0-9a-f]{64}$/.test(encodedKey))
    throw new Error('Report reply identity key is unavailable');
  const key = Buffer.from(encodedKey, 'hex');
  const identity = await reserveReportReplyIdentity(
    rpc,
    lease,
    { domain, keyVersion, key },
    reportEmailContentDigest(options.content.subject, options.content.html)
  );
  const replyTo = reconstructReportReplyAddress(identity, key);
  await recordReportReplyOutcome(rpc, identity, lease, 'submitting');
  let sendResult: Awaited<ReturnType<EmailService['send']>>;
  try {
    sendResult = await service.send({
      ...options,
      content: { ...options.content, replyTo: [replyTo] },
    });
  } catch {
    // Submission may have reached the provider. Durable submitting also blocks a resend
    // if this transition fails. Never log the provider exception or Reply-To.
    await recordReportReplyOutcome(
      rpc,
      identity,
      lease,
      'outcome_unknown'
    ).catch(() => undefined);
    return {
      sendResult: { success: false, deliveryOutcome: 'unknown' as const },
    };
  }
  const outcome =
    sendResult.deliveryOutcome === 'unknown'
      ? 'outcome_unknown'
      : sendResult.success
        ? 'accepted'
        : 'rejected';
  try {
    await recordReportReplyOutcome(
      rpc,
      identity,
      lease,
      outcome,
      sendResult.messageId
    );
  } catch {
    if (!sendResult.success)
      return {
        sendResult: { ...sendResult, deliveryOutcome: 'unknown' as const },
      };
    // Preserve provider acceptance in the caller even when its durable receipt fails.
    return { sendResult, trackingError: true };
  }
  return {
    sendResult,
    applicationSent: sendResult.success
      ? () =>
          recordReportReplyOutcome(
            rpc,
            identity,
            lease,
            'application_sent',
            sendResult.messageId
          )
      : undefined,
  };
}
