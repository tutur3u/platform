import { expect, it } from 'vitest';
import { digest } from '../cli/operational-schema';
import type { SearchDocument } from './lexical';
import { search } from './query';
import { normalizeVector } from './runtime';

const documents: SearchDocument[] = [
  'calendar-ui',
  'calendar-write',
  'storage-cache',
].map((id, index) => ({
  id,
  canonicalId: id,
  contributingIds: [id],
  title: id,
  text: index === 2 ? 'Storage cache' : 'Calendar RSVP',
  contentHash: digest(id),
  provenance: [
    {
      itemId: id,
      source: 'synthetic:query',
      firstEventSeq: index + 1,
      lastEventSeq: index + 1,
      events: [],
    },
  ],
}));
const unit = (index: number) =>
  Array.from({ length: 768 }, (_, i) => (i === index ? 1 : 0));

it('falls back to offline lexical scores without granting duplicate authority', async () => {
  const result = await search({ documents, query: 'calendar', mode: 'hybrid' });
  expect(result.mode).toBe('lexical');
  expect(result.fallbackReason).toBe('SEMANTIC_UNAVAILABLE');
  expect(result.results.map((row) => row.id)).toEqual([
    'calendar-ui',
    'calendar-write',
  ]);
  expect(
    result.results.every(
      (row) =>
        row.duplicateCandidate === 'uncertain' &&
        row.actionAuthorized === false &&
        row.provenance[0]?.source === 'synthetic:query'
    )
  ).toBe(true);
  await expect(
    search({ documents, query: 'calendar', mode: 'semantic' })
  ).rejects.toThrow('unavailable');
});

it('combines independent lexical and fixture vector ranks with visible component scores', async () => {
  const fingerprint = 'b'.repeat(64);
  const vectors = documents.map((document) => ({
    id: document.id,
    contentHash: document.contentHash,
    values: unit(document.id === 'storage-cache' ? 0 : 1),
  }));
  const runtime = { fingerprint, embed: async () => unit(0) };
  const result = await search({
    documents,
    vectors,
    modelFingerprint: fingerprint,
    query: 'calendar',
    runtime,
  });
  expect(result.mode).toBe('hybrid');
  expect(result.fallbackReason).toBeNull();
  expect(
    result.results.find((row) => row.id === 'storage-cache')?.semanticScore
  ).toBe(1);
  expect(
    result.results.find((row) => row.id === 'storage-cache')?.lexicalScore
  ).toBe(0);
  expect(result.accuracyMeasured).toBe(false);
  const changed = await search({
    documents,
    vectors,
    modelFingerprint: 'c'.repeat(64),
    query: 'calendar',
    runtime,
  });
  expect(changed.fallbackReason).toBe('SEMANTIC_UNAVAILABLE');
});

it('rejects NaNs, zero embeddings, mismatched dimensions and oversized queries', async () => {
  expect(() => normalizeVector(unit(0).map(() => 0))).toThrow('nonzero');
  expect(() => normalizeVector([1])).toThrow();
  expect(() => normalizeVector(unit(0).map(() => NaN))).toThrow();
  await expect(search({ documents, query: 'x'.repeat(4097) })).rejects.toThrow(
    'bounded query'
  );
});
