import { z } from 'zod';
import {
  type SnsEnvelope,
  type SnsVerification,
  snsEnvelopeSchema,
  trustedSubscribeUrl,
} from './sns';

export const SES_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export type SesBounceType = 'Permanent' | 'Transient' | 'Undetermined';

/** What is stored: identifiers and classification only, never content. */
export interface SesNotificationRecord {
  snsMessageId: string;
  topicArn: string;
  kind: 'bounce' | 'complaint';
  bounceType: SesBounceType | null;
  detail: string | null;
  sesMessageId: string | null;
  recipients: string[];
}

export interface SesNotificationDeps {
  topicArns: readonly string[];
  verify(envelope: SnsEnvelope): Promise<SnsVerification>;
  confirmSubscription(url: URL): Promise<boolean>;
  record(input: SesNotificationRecord): Promise<'recorded' | 'duplicate'>;
  allowRequest(clientIp: string): Promise<boolean>;
  clientIp?(request: Request): string;
}

const recipientsSchema = z
  .array(z.object({ emailAddress: z.string().trim().min(3).max(320) }))
  .min(1)
  .max(50);

// SES identity notifications use notificationType; configuration-set event
// publishing uses eventType. Both carry the same bounce/complaint objects.
const sesMessageSchema = z.object({
  notificationType: z.string().max(64).optional(),
  eventType: z.string().max(64).optional(),
  mail: z.object({ messageId: z.string().min(1).max(256) }).optional(),
  bounce: z
    .object({
      bounceType: z.enum(['Permanent', 'Transient', 'Undetermined']),
      bounceSubType: z.string().max(64).optional(),
      bouncedRecipients: recipientsSchema,
    })
    .optional(),
  complaint: z
    .object({
      complaintFeedbackType: z.string().max(64).optional(),
      complainedRecipients: recipientsSchema,
    })
    .optional(),
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

function defaultClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  );
}

/**
 * Reads the body up to the cap with a byte counter, cancelling the stream as
 * soon as it is exceeded, so an oversized body is never buffered whole.
 */
async function readBodyWithinCap(request: Request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SES_WEBHOOK_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toRecord(
  envelope: SnsEnvelope
): SesNotificationRecord | 'ignored' | null {
  const parsed = sesMessageSchema.safeParse(parseJson(envelope.Message));
  if (!parsed.success) return null;
  const message = parsed.data;
  const type = message.notificationType ?? message.eventType;
  const base = {
    snsMessageId: envelope.MessageId,
    topicArn: envelope.TopicArn,
    sesMessageId: message.mail?.messageId ?? null,
  };
  const addresses = (list: Array<{ emailAddress: string }>) => [
    ...new Set(list.map((r) => r.emailAddress.toLowerCase())),
  ];

  if (type === 'Bounce') {
    if (!message.bounce) return null;
    return {
      ...base,
      kind: 'bounce',
      bounceType: message.bounce.bounceType,
      detail: message.bounce.bounceSubType ?? null,
      recipients: addresses(message.bounce.bouncedRecipients),
    };
  }
  if (type === 'Complaint') {
    if (!message.complaint) return null;
    return {
      ...base,
      kind: 'complaint',
      bounceType: null,
      detail: message.complaint.complaintFeedbackType ?? null,
      recipients: addresses(message.complaint.complainedRecipients),
    };
  }
  return 'ignored';
}

/**
 * SES bounce and complaint notifications delivered by SNS. Order: rate limit,
 * size and shape, topic allowlist (403), signature (401; 503 when the signing
 * certificate is temporarily unavailable), then the message. Errors return
 * 5xx so SNS retries; the store is idempotent on MessageId.
 */
export async function handleSesNotificationRequest(
  request: Request,
  deps: SesNotificationDeps
): Promise<Response> {
  const ip = (deps.clientIp ?? defaultClientIp)(request);
  if (!(await deps.allowRequest(ip)))
    return json({ error: 'rate_limited' }, 429);

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > SES_WEBHOOK_MAX_BODY_BYTES)
    return json({ error: 'too_large' }, 413);
  const text = await readBodyWithinCap(request);
  if (text === null) return json({ error: 'too_large' }, 413);

  const parsed = snsEnvelopeSchema.safeParse(parseJson(text));
  if (!parsed.success) return json({ error: 'invalid_request' }, 400);
  const envelope = parsed.data;

  if (deps.topicArns.length === 0)
    return json({ error: 'not_configured' }, 503);
  if (!deps.topicArns.includes(envelope.TopicArn))
    return json({ error: 'forbidden' }, 403);
  const verification = await deps.verify(envelope);
  if (verification === 'unavailable') {
    console.warn(
      '[SesNotifications] Signing certificate unavailable; SNS will retry',
      {
        snsMessageId: envelope.MessageId,
      }
    );
    return json({ error: 'certificate_unavailable' }, 503);
  }
  if (verification !== 'valid')
    return json({ error: 'invalid_signature' }, 401);

  try {
    if (envelope.Type === 'SubscriptionConfirmation') {
      const url = trustedSubscribeUrl(envelope);
      if (!url) return json({ error: 'invalid_subscribe_url' }, 400);
      if (!(await deps.confirmSubscription(url)))
        return json({ error: 'confirmation_failed' }, 502);
      console.info('[SesNotifications] Subscription confirmed', {
        topicArn: envelope.TopicArn,
      });
      return json({ result: 'confirmed' });
    }
    if (envelope.Type === 'UnsubscribeConfirmation') {
      console.warn('[SesNotifications] Unsubscribe confirmation received', {
        topicArn: envelope.TopicArn,
      });
      return json({ result: 'ignored' });
    }

    const record = toRecord(envelope);
    if (record === null) return json({ error: 'invalid_message' }, 400);
    if (record === 'ignored') return json({ result: 'ignored' });
    const result = await deps.record(record);
    console.info('[SesNotifications] Notification processed', {
      snsMessageId: record.snsMessageId,
      kind: record.kind,
      bounceType: record.bounceType,
      recipients: record.recipients.length,
      result,
    });
    return json({ result });
  } catch (error) {
    console.error('[SesNotifications] Processing failed', {
      snsMessageId: envelope.MessageId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: 'internal_error' }, 500);
  }
}
