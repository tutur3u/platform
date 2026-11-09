import type { AppealBinding } from '@tuturuuu/email-service/appeal-transport';
import { z } from 'zod';
import {
  snsEnvelopeSchema,
  type SnsEnvelope,
  type SnsVerification,
} from './feedback-sns';

export const APPEAL_FEEDBACK_MAX_BYTES = 256 * 1024;
export type FeedbackStatus = 'recorded' | 'duplicate' | 'invalid';
export type FeedbackRecord = {
  eventId: string;
  messageId: string;
  appealId: string;
  accountId: string;
  region: string;
  email: string;
  wsId: string;
  eventType: 'bounce' | 'complaint';
  bounceType: 'hard' | 'soft' | 'transient' | null;
};
export type FeedbackBinding = Pick<
  AppealBinding,
  'accountId' | 'region' | 'identity' | 'configurationSet'
>;
export type AppealFeedbackDependencies = {
  bindings: readonly FeedbackBinding[];
  topics: readonly string[];
  authenticate(envelope: SnsEnvelope): Promise<SnsVerification>;
  record(input: FeedbackRecord): Promise<FeedbackStatus>;
};

const recipient = z.object({ emailAddress: z.email() });
const mailSchema = z.object({
  messageId: z.string().min(1).max(200),
  sendingAccountId: z.string().regex(/^\d{12}$/),
  source: z.email(),
  sourceArn: z.string().min(1).max(512),
  destination: z.array(z.email()).length(1),
  tags: z.object({
    appeal_id: z.tuple([z.uuid()]),
    workspace_id: z.tuple([z.uuid()]),
    'ses:configuration-set': z.tuple([z.string().min(1).max(64)]),
  }),
});
const eventSchema = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('Bounce'),
    mail: mailSchema,
    bounce: z.object({
      bounceType: z.enum(['Permanent', 'Transient', 'Undetermined']),
      bouncedRecipients: z.array(recipient).length(1),
    }),
  }),
  z.object({
    eventType: z.literal('Complaint'),
    mail: mailSchema,
    complaint: z.object({ complainedRecipients: z.array(recipient).length(1) }),
  }),
]);

function response(status: string, httpStatus = 200) {
  return Response.json(
    { status },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

export async function readFeedbackText(
  response: Pick<Response, 'body'>,
  limit: number
) {
  if (!response.body) throw new Error('empty_body');
  const reader = response.body.getReader();
  const buffer = new Uint8Array(limit);
  let bytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new Error('body_timeout');
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      buffer.set(part.value, bytes - part.value.byteLength);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(
    buffer.subarray(0, bytes)
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function handleAppealFeedback(
  request: Request,
  deps: AppealFeedbackDependencies
) {
  if (!deps.bindings.length || !deps.topics.length)
    return response('unavailable', 503);
  let raw: string;
  try {
    raw = await readFeedbackText(request, APPEAL_FEEDBACK_MAX_BYTES);
  } catch (error) {
    const status =
      error instanceof Error && error.message === 'body_too_large'
        ? 413
        : error instanceof Error && error.message === 'body_timeout'
          ? 408
          : 400;
    return response('invalid', status);
  }
  const parsedEnvelope = snsEnvelopeSchema.safeParse(parseJson(raw));
  if (!parsedEnvelope.success) return response('invalid', 400);
  const envelope = parsedEnvelope.data;
  const topicBindings = deps.bindings.filter((candidate) =>
    envelope.TopicArn.startsWith(
      `arn:aws:sns:${candidate.region}:${candidate.accountId}:`
    )
  );
  if (!deps.topics.includes(envelope.TopicArn) || !topicBindings.length)
    return response('invalid', 403);
  if (envelope.Type !== 'Notification')
    return response('subscription_requires_operator', 503);
  let authenticated: SnsVerification;
  try {
    authenticated = await deps.authenticate(envelope);
  } catch {
    return response('unavailable', 503);
  }
  if (authenticated === 'unavailable') return response('unavailable', 503);
  if (authenticated !== 'valid') return response('invalid', 401);
  const parsedEvent = eventSchema.safeParse(parseJson(envelope.Message));
  if (!parsedEvent.success) return response('invalid', 400);
  const event = parsedEvent.data;
  const mail = event.mail;
  const binding = topicBindings.find((candidate) => {
    const arnPrefix = `arn:aws:ses:${candidate.region}:${candidate.accountId}:identity/`;
    const senderDomain = candidate.identity.split('@')[1];
    const identityMatches =
      mail.sourceArn === `${arnPrefix}${candidate.identity}` ||
      mail.sourceArn === `${arnPrefix}${senderDomain}`;
    return (
      mail.sendingAccountId === candidate.accountId &&
      identityMatches &&
      mail.source.toLowerCase() === candidate.identity.toLowerCase() &&
      mail.tags['ses:configuration-set'][0] === candidate.configurationSet
    );
  });
  if (!binding) return response('invalid', 403);
  const target =
    event.eventType === 'Bounce'
      ? event.bounce.bouncedRecipients[0]
      : event.complaint.complainedRecipients[0];
  const destination = mail.destination[0];
  if (
    !target ||
    !destination ||
    target.emailAddress.toLowerCase() !== destination.toLowerCase()
  )
    return response('invalid', 400);
  const bounceType =
    event.eventType === 'Complaint'
      ? null
      : event.bounce.bounceType === 'Permanent'
        ? 'hard'
        : event.bounce.bounceType === 'Transient'
          ? 'soft'
          : 'transient';
  try {
    const status = await deps.record({
      eventId: envelope.MessageId,
      messageId: mail.messageId,
      appealId: mail.tags.appeal_id[0],
      accountId: binding.accountId,
      region: binding.region,
      email: target.emailAddress.toLowerCase(),
      wsId: mail.tags.workspace_id[0],
      eventType: event.eventType === 'Bounce' ? 'bounce' : 'complaint',
      bounceType,
    });
    return response(status, status === 'invalid' ? 400 : 200);
  } catch {
    return response('unavailable', 503);
  }
}
