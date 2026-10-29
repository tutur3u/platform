import { z } from 'zod';

/**
 * Fleet Tools push event contract. Version 1 is frozen; version 2 adds a
 * closed-enum `urgency`. The hub sends v2 only for items that carry a valid
 * urgency, so mixed v1/v2 traffic is the normal state. Both objects are
 * strict: they carry no title, product or text, and any extra field is
 * rejected.
 */
export const MASTERMIND_PUSH_EVENT_TYPES = [
  'needs_you.new',
  'decision.awaiting',
  'pin_batch.new',
] as const;

export type MastermindPushEventType =
  (typeof MASTERMIND_PUSH_EVENT_TYPES)[number];

export const MASTERMIND_PUSH_URGENCIES = [
  'now',
  'today',
  'soon',
  'whenever',
] as const;

export type MastermindPushUrgency = (typeof MASTERMIND_PUSH_URGENCIES)[number];

const baseFields = {
  type: z.enum(MASTERMIND_PUSH_EVENT_TYPES),
  item_id: z.string().regex(/^item-[0-9a-f]{20}$/),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ts: z.iso.datetime(),
};

const mastermindPushEventV1Schema = z.strictObject({
  v: z.literal(1),
  ...baseFields,
});

const mastermindPushEventV2Schema = z.strictObject({
  v: z.literal(2),
  ...baseFields,
  urgency: z.enum(MASTERMIND_PUSH_URGENCIES),
});

export const mastermindPushEventSchema = z.discriminatedUnion('v', [
  mastermindPushEventV1Schema,
  mastermindPushEventV2Schema,
]);

export type MastermindPushEvent = z.infer<typeof mastermindPushEventSchema>;

/** v1 events carry no urgency and count as `today`. */
export function mastermindPushUrgency(
  event: MastermindPushEvent
): MastermindPushUrgency {
  return event.v === 2 ? event.urgency : 'today';
}

/**
 * Dedupe identity agreed with Fleet Tools: (type, item_id, seq). `v` and
 * `urgency` are not part of it, so a v1 and a v2 body with the same tuple are
 * the same event.
 */
export function mastermindPushEventKey(event: MastermindPushEvent) {
  return `${event.type}:${event.item_id}:${event.seq}`;
}

export type MastermindPushEventRejection = {
  version: 1 | 2 | 'unknown';
  type: MastermindPushEventType | 'unknown';
  issue:
    | 'not_object'
    | 'unsupported_version'
    | 'missing_urgency'
    | 'invalid_urgency'
    | 'invalid_fields';
};

function includes<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (values as readonly unknown[]).includes(value);
}

/**
 * Log-safe summary of why a parsed body failed the schema. It only ever
 * returns closed-set values, never input content.
 */
export function describeMastermindPushEventRejection(
  input: unknown
): MastermindPushEventRejection {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return { version: 'unknown', type: 'unknown', issue: 'not_object' };

  const record = input as Record<string, unknown>;
  const version = record.v === 1 || record.v === 2 ? record.v : 'unknown';
  const type = includes(MASTERMIND_PUSH_EVENT_TYPES, record.type)
    ? record.type
    : 'unknown';

  if (version === 'unknown')
    return { version, type, issue: 'unsupported_version' };
  if (version === 2 && !('urgency' in record))
    return { version, type, issue: 'missing_urgency' };
  if (version === 2 && !includes(MASTERMIND_PUSH_URGENCIES, record.urgency))
    return { version, type, issue: 'invalid_urgency' };
  return { version, type, issue: 'invalid_fields' };
}
