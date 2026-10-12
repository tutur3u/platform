import { digest, fail } from '../cli/operational-schema';
import type {
  OutcomeProjectionPage,
  OutcomeProjectionRequest,
} from '../operational-graph/contracts';
import { cacheSchema, type SearchCache } from './cache';
import { type SearchDocument, searchableDocumentSchema } from './lexical';
import type { EmbeddingRuntime } from './runtime';

export type ProjectionReader = (
  request: { path: string } & OutcomeProjectionRequest
) => OutcomeProjectionPage | Promise<OutcomeProjectionPage>;

export async function collectDocuments({
  path,
  readProjection,
}: {
  path: string;
  readProjection: ProjectionReader;
}) {
  let page = await readProjection({ path, limit: 500 });
  const identity = {
    sourceDatabaseId: page.sourceDatabaseId,
    revision: page.revision,
    snapshotHash: page.snapshotHash,
    projectionVersion: page.projectionVersion,
    semanticCacheAllowed: page.semanticCacheAllowed,
  };
  const documents: SearchDocument[] = [];
  const ids = new Set<string>();
  let bytes = 0;
  for (let pages = 0; ; pages++) {
    if (
      pages >= 20 ||
      page.sourceDatabaseId !== identity.sourceDatabaseId ||
      page.revision !== identity.revision ||
      page.snapshotHash !== identity.snapshotHash ||
      page.projectionVersion !== identity.projectionVersion ||
      page.semanticCacheAllowed !== identity.semanticCacheAllowed
    )
      fail(
        'PROJECTION_REVISION_CONFLICT',
        'search cannot mix projection pages'
      );
    for (const record of page.records) {
      if (ids.has(record.id))
        fail('INVALID_PROJECTION', 'repeated projection item');
      ids.add(record.id);
      const document = searchableDocumentSchema.parse({
        id: record.id,
        canonicalId: record.canonicalId,
        contributingIds: record.contributingIds,
        title: record.members.map((member) => member.item.title).join(' | '),
        text: record.members
          .map(({ item }) =>
            [
              item.id,
              item.title,
              item.source,
              item.acceptance,
              item.note,
              ...item.links,
              ...(item.dependencies ?? []),
              ...item.requiredEvidence,
            ].join('\n')
          )
          .join('\n'),
        contentHash: digest(record),
        provenance: record.members.map((member) => member.provenance),
      });
      bytes += Buffer.byteLength(JSON.stringify(document));
      if (bytes > 24 * 1024 ** 2)
        fail('SEARCH_CAPACITY', 'search corpus exceeds 24 MiB');
      documents.push(document);
    }
    if (!page.nextCursor) break;
    page = await readProjection({ path, limit: 500, cursor: page.nextCursor });
  }
  return { ...identity, documents };
}

export async function buildIndex({
  path,
  readProjection,
  runtime,
}: {
  path: string;
  readProjection: ProjectionReader;
  runtime?: EmbeddingRuntime;
}): Promise<SearchCache> {
  const source = await collectDocuments({ path, readProjection });
  if (!source.semanticCacheAllowed || !source.sourceDatabaseId)
    fail(
      'LEGACY_CACHE_DENIED',
      'legacy null identity requires separately authorized adoption before persistent indexing'
    );
  const vectors: SearchCache['vectors'] = [];
  if (runtime) {
    if (source.documents.length > 8)
      fail(
        'EMBEDDING_CAPACITY',
        'first semantic indexing slice is bounded to 8 records'
      );
    for (const document of source.documents)
      vectors.push({
        id: document.id,
        contentHash: document.contentHash,
        values: await runtime.embed(
          document.text.replace(/\n/g, ' '),
          'document',
          document.title
        ),
      });
  }
  return cacheSchema.parse({
    version: 1,
    projectionVersion: 1,
    sourceDatabaseId: source.sourceDatabaseId,
    revision: source.revision,
    snapshotHash: source.snapshotHash,
    modelFingerprint: runtime?.fingerprint ?? null,
    documents: source.documents,
    vectors,
  });
}
