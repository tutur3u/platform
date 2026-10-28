import { z } from 'zod';

/**
 * Frozen Fleet Tools push event contract, version 1. The object is strict:
 * it carries no title, product or text, and any extra field is rejected.
 */
export const MASTERMIND_PUSH_EVENT_VERSION = 1;

export const MASTERMIND_PUSH_EVENT_TYPES = [
  'needs_you.new',
  'decision.awaiting',
  'pin_batch.new',
] as const;

export type MastermindPushEventType =
  (typeof MASTERMIND_PUSH_EVENT_TYPES)[number];

export const mastermindPushEventSchema = z.strictObject({
  v: z.literal(MASTERMIND_PUSH_EVENT_VERSION),
  type: z.enum(MASTERMIND_PUSH_EVENT_TYPES),
  item_id: z.string().regex(/^item-[0-9a-f]{20}$/),
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ts: z.iso.datetime(),
});

export type MastermindPushEvent = z.infer<typeof mastermindPushEventSchema>;

/** Dedupe identity agreed with Fleet Tools: (type, item_id, seq). */
export function mastermindPushEventKey(event: MastermindPushEvent) {
  return `${event.type}:${event.item_id}:${event.seq}`;
}
