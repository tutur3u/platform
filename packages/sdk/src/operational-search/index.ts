import { digest, fail } from '../cli/operational-schema';
import type {
  OutcomeProjectionPage,
  OutcomeProjectionRequest,
} from '../operational-graph/contracts';
import { cacheSchema, type SearchCache } from './cache';
import { type SearchDocument, searchableDocumentSchema } from './lexical';
import { type EmbeddingRuntime, normalizeVector } from './runtime';

function documentInput(document: { title: string; text: string }) {
  return {
    title: document.title.trim(),
    text: document.text.replace(/\n/g, ' ').trim(),
  };
}

export type IndexStats = {
  strategy: 'snapshot-reconciled-vector-reuse-v1';
  reuseEligible: boolean;
  reused: number;
  computed: number;
  removed: number;
  invalidated: number;
};
export type IndexResult = { cache: SearchCache; stats: IndexStats };
export class IndexEmbeddingError extends Error {
  constructor() {
    super('local index embedding failed');
  }
}

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
      const content = {
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
        provenance: record.members.map((member) => member.provenance),
      };
      const document = searchableDocumentSchema.parse({
        ...content,
        contentHash: digest({
          contentPolicy: 'record-and-document-input-v1',
          record,
          embeddingInput: documentInput(content),
        }),
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
  previous,
}: {
  path: string;
  readProjection: ProjectionReader;
  runtime?: EmbeddingRuntime;
  previous?: SearchCache;
}): Promise<IndexResult> {
  const source = await collectDocuments({ path, readProjection });
  if (!source.semanticCacheAllowed || !source.sourceDatabaseId)
    fail(
      'LEGACY_CACHE_DENIED',
      'legacy null identity requires separately authorized adoption before persistent indexing'
    );
  const prior = previous ? cacheSchema.parse(previous) : undefined;
  const sameSource = Boolean(
    prior &&
      prior.sourceDatabaseId === source.sourceDatabaseId &&
      prior.projectionVersion === source.projectionVersion
  );
  const reuseEligible = Boolean(
    runtime &&
      prior &&
      sameSource &&
      prior.modelFingerprint === runtime.fingerprint &&
      prior.revision <= source.revision &&
      (prior.revision !== source.revision ||
        prior.snapshotHash === source.snapshotHash)
  );
  const priorVectors = new Map(
    prior?.vectors.map((vector) => [vector.id, vector])
  );
  const currentIds = new Set(source.documents.map((document) => document.id));
  const removed = sameSource
    ? (prior?.vectors.filter((vector) => !currentIds.has(vector.id)).length ??
      0)
    : 0;
  const vectors: SearchCache['vectors'] = [];
  let reused = 0;
  let computed = 0;
  if (runtime) {
    if (source.documents.length > 8)
      fail(
        'EMBEDDING_CAPACITY',
        'first semantic indexing slice is bounded to 8 records'
      );
    for (const document of source.documents) {
      const survivor = priorVectors.get(document.id);
      if (reuseEligible && survivor?.contentHash === document.contentHash) {
        vectors.push({ ...survivor, values: [...survivor.values] });
        reused++;
        continue;
      }
      const input = documentInput(document);
      let values: number[];
      try {
        values = normalizeVector(
          await runtime.embed(input.text, 'document', input.title)
        );
      } catch {
        throw new IndexEmbeddingError();
      }
      vectors.push({
        id: document.id,
        contentHash: document.contentHash,
        values,
      });
      computed++;
    }
  }
  const cache = cacheSchema.parse({
    version: 1,
    projectionVersion: source.projectionVersion,
    sourceDatabaseId: source.sourceDatabaseId,
    revision: source.revision,
    snapshotHash: source.snapshotHash,
    modelFingerprint: runtime?.fingerprint ?? null,
    documents: source.documents,
    vectors,
  });
  return {
    cache,
    stats: {
      strategy: 'snapshot-reconciled-vector-reuse-v1',
      reuseEligible,
      reused,
      computed,
      removed,
      invalidated: (prior?.vectors.length ?? 0) - reused - removed,
    },
  };
}
