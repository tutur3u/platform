import { z } from 'zod';
import { eventSchema, itemSchema, slug, text } from '../cli/operational-schema';

export const OUTCOME_PROJECTION_VERSION = 1;
export const OUTCOME_PROJECTION_MAX_BYTES = 32 * 1024 * 1024;
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const outcomeSnapshotSchema = z
  .object({
    sourceDatabaseId: z.uuid().nullable(),
    revision,
    items: z.array(itemSchema).max(10_000),
    events: z.array(eventSchema).max(100_000),
  })
  .strict();
export type OutcomeSnapshot = z.infer<typeof outcomeSnapshotSchema>;

export const outcomeProjectionCursorSchema = z
  .object({
    projectionVersion: z.literal(OUTCOME_PROJECTION_VERSION),
    sourceDatabaseId: z.uuid().nullable(),
    revision,
    snapshotHash: hash,
    afterId: slug,
  })
  .strict();
export type OutcomeProjectionCursor = z.infer<
  typeof outcomeProjectionCursorSchema
>;

export const outcomeProjectionRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(500).default(100),
    cursor: outcomeProjectionCursorSchema.optional(),
  })
  .strict();
export type OutcomeProjectionRequest = z.input<
  typeof outcomeProjectionRequestSchema
>;

const provenanceSchema = z
  .object({
    itemId: slug,
    source: text,
    firstEventSeq: revision,
    lastEventSeq: revision,
    events: z
      .array(
        z
          .object({
            seq: revision,
            at: text,
            action: text,
            payloadHash: hash,
          })
          .strict()
          .readonly()
      )
      .min(1)
      .readonly(),
  })
  .strict()
  .readonly();
export const outcomeProjectionRecordSchema = z
  .object({
    id: slug,
    canonicalId: slug,
    contributingIds: z.array(slug).min(1).readonly(),
    members: z
      .array(
        z
          .object({ item: itemSchema.readonly(), provenance: provenanceSchema })
          .strict()
          .readonly()
      )
      .min(1)
      .readonly(),
  })
  .strict()
  .readonly();
export type OutcomeProjectionRecord = z.infer<
  typeof outcomeProjectionRecordSchema
>;

const page = z
  .object({
    projectionVersion: z.literal(OUTCOME_PROJECTION_VERSION),
    revision,
    snapshotHash: hash,
    records: z.array(outcomeProjectionRecordSchema).max(500).readonly(),
    nextCursor: outcomeProjectionCursorSchema.nullable(),
    liveVerificationPerformed: z.literal(false),
  })
  .strict();
export const outcomeProjectionPageSchema = z.discriminatedUnion(
  'semanticCacheAllowed',
  [
    page.extend({
      sourceDatabaseId: z.uuid(),
      semanticCacheAllowed: z.literal(true),
    }),
    page.extend({
      sourceDatabaseId: z.null(),
      semanticCacheAllowed: z.literal(false),
    }),
  ]
);
export type OutcomeProjectionPage = z.infer<typeof outcomeProjectionPageSchema>;
