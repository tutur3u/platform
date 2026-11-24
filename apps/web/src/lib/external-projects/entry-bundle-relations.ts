import { z } from 'zod';

/** Serialized size limit for one relation's metadata, in UTF-8 bytes. */
export const RELATION_METADATA_MAX_BYTES = 2048;
/** Longest string value one metadata field may hold. */
export const RELATION_METADATA_STRING_MAX_LENGTH = 280;
/** Most relations one entry bundle may write. */
export const ENTRY_BUNDLE_MAX_RELATIONS = 256;

const encoder = new TextEncoder();

/**
 * Relation metadata is a flat object of short scalar values, for example
 * `{ kind, direction, note }`. Nested values are refused so delivery stays
 * small and predictable for every client.
 */
export const relationMetadataSchema = z
  .record(
    // Keys are taken as written: surrounding spaces would let two keys
    // collapse into one.
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^\S(?:.*\S)?$/),
    z.union([
      z.string().max(RELATION_METADATA_STRING_MAX_LENGTH),
      z.number(),
      z.boolean(),
      z.null(),
    ])
  )
  .refine(
    (metadata) =>
      encoder.encode(JSON.stringify(metadata)).byteLength <=
      RELATION_METADATA_MAX_BYTES,
    {
      message: `Relation metadata exceeds ${RELATION_METADATA_MAX_BYTES} bytes`,
    }
  );

export const entryBundleRelationSchema = z.object({
  definitionId: z.string().uuid(),
  metadata: relationMetadataSchema.default({}),
  sortOrder: z.number().int().min(0).max(2_147_483_647).default(0),
  toEntryId: z.string().uuid(),
});

export const entryBundleRelationsSchema = z
  .array(entryBundleRelationSchema)
  .max(ENTRY_BUNDLE_MAX_RELATIONS);
