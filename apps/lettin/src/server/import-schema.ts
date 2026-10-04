import { z } from 'zod';

const object = z.record(z.string(), z.unknown());
const relation = z.object({
  targetEntryId: z.string().optional(),
  targetStableSourceId: z.string().optional(),
  definitionKey: z.string().default('related'),
  metadata: object.optional(),
});
const entry = z.object({
  id: z.string().max(200).optional(),
  stableSourceId: z.string().min(1).max(200).optional(),
  collectionSlug: z.string().max(100),
  title: z.string().min(1).max(160),
  slug: z.string().max(160).optional(),
  summary: z.string().max(2000).nullable().optional(),
  bodyMarkdown: z.string().max(100000).nullable().optional(),
  profileData: object.optional(),
  metadata: object.optional(),
  blocks: z
    .array(
      z.object({
        title: z.string().nullable().optional(),
        blockType: z.string(),
        content: object,
      })
    )
    .max(100)
    .optional(),
  assets: z
    .array(
      z.object({
        assetType: z.string(),
        sourceUrl: z.string().nullable().optional(),
        altText: z.string().nullable().optional(),
      })
    )
    .max(100)
    .optional(),
  relations: z.array(relation).max(100).optional(),
});
/** Current CMS snapshots, delivery exports, and secured canonical cutover exports. */
export function parseExocorpseExport(value: unknown) {
  const root = object.parse(value);
  if (root.adapter !== undefined && root.adapter !== 'exocorpse')
    throw new Error('Expected Exocorpse content');
  let records: unknown = root.entries;
  if (root.content && typeof root.content === 'object')
    records = (root.content as Record<string, unknown>).entries;
  const bundles = z.array(object).min(1).max(1000).parse(records);
  return bundles.map((bundle) =>
    entry.parse(
      bundle.entry
        ? {
            ...object.parse(bundle.entry),
            blocks: bundle.blocks,
            assets: bundle.assets,
            relations: bundle.relations,
          }
        : bundle
    )
  );
}
export type ImportSourceEntry = ReturnType<typeof parseExocorpseExport>[number];
