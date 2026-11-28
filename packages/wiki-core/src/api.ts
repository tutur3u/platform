import { z } from 'zod';
import { wikiDocumentSchema, wikiHrefSchema } from './schema';
import { wikiPageSlugPattern, wikiSpaceSlugPattern } from './urls';

export const wikiVisibilitySchema = z.enum(['private', 'internal', 'public']);
export const wikiNonPublicVisibilitySchema = z.enum(['private', 'internal']);
export const wikiSpaceSlugSchema = z.string().regex(wikiSpaceSlugPattern);
export const wikiPageSlugSchema = z
  .string()
  .max(100)
  .regex(wikiPageSlugPattern);
export const wikiPagePathSchema = z
  .string()
  .max(807)
  .refine(
    (value) =>
      value === '' ||
      (value.split('/').length <= 8 &&
        value
          .split('/')
          .every((segment) => wikiPageSlugSchema.safeParse(segment).success)),
    'Expected a canonical wiki path of up to eight segments'
  );
export const wikiRevisionSchema = z.number().int().min(1).max(2_147_483_647);
export const wikiIdempotencyKeySchema = z.uuid();
export const wikiBodyHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const title = z.string().trim().min(1).max(200);
const description = z.string().max(2000);
const message = z.string().max(500).optional();
const revisionFields = {
  title,
  description: description.optional(),
  body: wikiDocumentSchema,
  message,
  agent_label: z.string().max(100).optional(),
};

export const wikiCreateSpaceSchema = z.strictObject({
  slug: wikiSpaceSlugSchema,
  title,
  description: description.optional(),
  default_visibility: wikiNonPublicVisibilitySchema.default('internal'),
});

export const wikiCreatePageSchema = z.strictObject({
  ...revisionFields,
  parent_path: wikiPagePathSchema.optional(),
  slug: wikiPageSlugSchema,
  visibility: wikiNonPublicVisibilitySchema.optional(),
});
export const wikiSavePageSchema = z.strictObject({
  ...revisionFields,
  base_revision: wikiRevisionSchema,
});
export const wikiMovePageSchema = z.strictObject({
  parent_path: wikiPagePathSchema,
  slug: wikiPageSlugSchema,
  base_revision: wikiRevisionSchema,
});
export const wikiSetVisibilitySchema = z.strictObject({
  visibility: wikiNonPublicVisibilitySchema,
});
export const wikiPublishPageSchema = z.strictObject({
  revision: wikiRevisionSchema.optional(),
});
export const wikiUnpublishPageSchema = z.strictObject({});
export const wikiArchivePageSchema = z.strictObject({
  base_revision: wikiRevisionSchema,
});
export const wikiUnarchivePageSchema = wikiArchivePageSchema;
export const wikiRestoreRevisionSchema = z.strictObject({
  revision: wikiRevisionSchema,
  base_revision: wikiRevisionSchema,
  message,
});

const bulkOperation = z.discriminatedUnion('op', [
  wikiCreatePageSchema.extend({ op: z.literal('create') }),
  wikiSavePageSchema.extend({ op: z.literal('save'), page_id: z.uuid() }),
  wikiMovePageSchema.extend({ op: z.literal('move'), page_id: z.uuid() }),
  wikiArchivePageSchema.extend({ op: z.literal('archive'), page_id: z.uuid() }),
]);
export const wikiBulkSchema = z
  .strictObject({
    dry_run: z.boolean().default(true),
    operations: z.array(bulkOperation).min(1).max(50),
    allow_archive: z.number().int().min(0).max(50).optional(),
  })
  .superRefine(({ operations, allow_archive, dry_run }, ctx) => {
    const archiveCount = operations.filter(({ op }) => op === 'archive').length;
    if (!dry_run && archiveCount > 10 && allow_archive !== archiveCount)
      ctx.addIssue({
        code: 'custom',
        path: ['allow_archive'],
        message: 'Confirm the exact number of archives',
      });
    if (
      new TextEncoder().encode(JSON.stringify({ operations })).length >
      25_000_000
    )
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Bulk payload exceeds the byte limit',
      });
  });

const redirectFromPath = wikiPagePathSchema.min(1);
const redirectFields = {
  from_path: redirectFromPath,
  status: z.union([z.literal(301), z.literal(302)]).default(301),
};
export const wikiUpsertRedirectSchema = z.union([
  z.strictObject({ ...redirectFields, to_page_id: z.uuid() }),
  z.strictObject({
    ...redirectFields,
    to_url: wikiHrefSchema.refine(
      (value) => value.startsWith('/wiki/') && !value.includes('#')
    ),
  }),
]);
export const wikiDeleteRedirectSchema = z.strictObject({
  from_path: redirectFromPath,
});
const dimension = z.number().int().min(1).max(4096).optional();
export const wikiAssetUploadSchema = z.strictObject({
  width: dimension,
  height: dimension,
  alt: z.string().max(1000).optional(),
});

/** Persist only file properties computed by the server. */
export const wikiAssetMetadataSchema = wikiAssetUploadSchema.extend({
  sha256: wikiBodyHashSchema,
  mime: z.enum([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ]),
  bytes: z.number().int().min(1).max(10_000_000),
});
export const wikiAuditSchema = z.strictObject({
  public_only: z.boolean().default(false),
});

const queryInteger = (schema: typeof wikiRevisionSchema) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(schema);
export const wikiListPagesQuerySchema = z.strictObject({
  tree: z.literal('1').optional(),
  prefix: wikiPagePathSchema.optional(),
  visibility: wikiVisibilitySchema.optional(),
  limit: queryInteger(wikiRevisionSchema.max(500)).optional(),
});
export const wikiGetPageQuerySchema = z.strictObject({
  path: wikiPagePathSchema,
  revision: queryInteger(wikiRevisionSchema).optional(),
  format: z.enum(['json', 'md']).default('json'),
});
export const wikiListRevisionsQuerySchema = z.strictObject({
  limit: queryInteger(wikiRevisionSchema.max(500)).optional(),
});
export const wikiSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  limit: queryInteger(wikiRevisionSchema.max(20)).optional(),
});
export const wikiRevisionConflictSchema = z.strictObject({
  current_revision: wikiRevisionSchema,
  current_hash: wikiBodyHashSchema,
});
