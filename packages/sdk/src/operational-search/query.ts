import { fail } from '../cli/operational-schema';
import type { SearchCache } from './cache';
import { lexicalSearch, type SearchDocument } from './lexical';
import { type EmbeddingRuntime, normalizeVector } from './runtime';

export async function search({
  documents,
  vectors = [],
  modelFingerprint = null,
  query,
  mode = 'hybrid',
  limit = 10,
  runtime,
}: {
  documents: readonly SearchDocument[];
  vectors?: SearchCache['vectors'];
  modelFingerprint?: string | null;
  query: string;
  mode?: 'lexical' | 'hybrid' | 'semantic';
  limit?: number;
  runtime?: EmbeddingRuntime;
}) {
  if (
    !query.trim() ||
    Buffer.byteLength(query) > 4096 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    fail(
      'INVALID_INPUT',
      'search requires a nonblank bounded query and limit 1..100'
    );
  const lexical = lexicalSearch(documents, query);
  let semantic: { id: string; score: number }[] = [];
  let fallbackReason: string | null = null;
  if (mode !== 'lexical') {
    if (
      !runtime ||
      !modelFingerprint ||
      runtime.fingerprint !== modelFingerprint ||
      vectors.length !== documents.length
    )
      fallbackReason = 'SEMANTIC_UNAVAILABLE';
    else {
      try {
        const embedding = normalizeVector(await runtime.embed(query, 'query'));
        semantic = vectors
          .map((vector) => ({
            id: vector.id,
            score: normalizeVector(vector.values).reduce(
              (sum, value, i) => sum + value * (embedding[i] ?? 0),
              0
            ),
          }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
      } catch {
        fallbackReason = 'SEMANTIC_RUNTIME_FAILED';
      }
    }
    if (mode === 'semantic' && fallbackReason)
      fail(
        fallbackReason,
        'semantic search is unavailable; use lexical or hybrid fallback'
      );
  }
  const effectiveMode = mode === 'lexical' || fallbackReason ? 'lexical' : mode;
  const candidates = new Set(
    effectiveMode === 'semantic'
      ? semantic.map((row) => row.id)
      : lexical.map((row) => row.id)
  );
  if (effectiveMode === 'hybrid')
    for (const row of semantic) candidates.add(row.id);
  const documentById = new Map(
    documents.map((document) => [document.id, document])
  );
  const lexicalById = new Map(
    lexical.map((row, rank) => [row.id, { ...row, rank }])
  );
  const semanticById = new Map(
    semantic.map((row, rank) => [row.id, { ...row, rank }])
  );
  const results = [...candidates]
    .map((id) => {
      const document = documentById.get(id);
      if (!document)
        fail('INVALID_CACHE', 'ranking points to an absent document');
      const lexicalRank = lexicalById.get(id)?.rank ?? -1;
      const semanticRank = semanticById.get(id)?.rank ?? -1;
      const lexicalScore = lexicalById.get(id)?.score ?? 0;
      const semanticScore = semanticById.get(id)?.score ?? null;
      const score =
        effectiveMode === 'lexical'
          ? lexicalScore
          : effectiveMode === 'semantic'
            ? (semanticScore ?? 0)
            : (lexicalRank < 0 ? 0 : 1 / (61 + lexicalRank)) +
              (semanticRank < 0 ? 0 : 1 / (61 + semanticRank));
      return {
        id,
        canonicalId: document.canonicalId,
        contributingIds: document.contributingIds,
        title: document.title,
        score,
        lexicalScore,
        semanticScore,
        provenance: document.provenance,
        duplicateCandidate: 'uncertain' as const,
        actionAuthorized: false as const,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'))
    .slice(0, limit);
  return {
    mode: effectiveMode,
    requestedMode: mode,
    fallbackReason,
    results,
    liveVerificationPerformed: false,
    accuracyMeasured: false,
  };
}
