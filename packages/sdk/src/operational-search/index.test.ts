import { expect, it, vi } from 'vitest';
import { digest, type Item } from '../cli/operational-schema';
import {
  type OutcomeProjectionPage,
  type OutcomeProjectionRecord,
  outcomeProjectionPageSchema,
} from '../operational-graph/contracts';
import { cacheSchema } from './cache';
import { buildIndex, collectDocuments } from './index';
import type { EmbeddingRuntime } from './runtime';

const uuid = '00000000-0000-4000-8000-000000000001';
const fingerprint = digest({ model: 1, recipe: 1, adapter: 1, native: 1 });
const unit = () => Array.from({ length: 768 }, (_, i) => (i === 0 ? 2 : 0));
function item(id: string, changes: Partial<Item> = {}): Item {
  return {
    id,
    title: `Calendar ${id}`,
    kind: 'feature',
    source: 'synthetic:index',
    acceptance: `unique acceptance ${id}`,
    requiredEvidence: ['focused'],
    status: 'captured',
    owner: '',
    links: [],
    note: '',
    ...changes,
  };
}
function record(
  id: string,
  members = [item(id)],
  seq = 1
): OutcomeProjectionRecord {
  return {
    id,
    canonicalId: id,
    contributingIds: members.map((member) => member.id),
    members: members.map((member) => ({
      item: member,
      provenance: {
        itemId: member.id,
        source: member.source,
        firstEventSeq: 1,
        lastEventSeq: seq,
        events: [
          {
            seq,
            at: 'synthetic',
            action: 'intake',
            payloadHash: digest(member),
          },
        ],
      },
    })),
  };
}
function page(
  records: OutcomeProjectionRecord[],
  revision = 1
): OutcomeProjectionPage {
  return {
    projectionVersion: 1,
    sourceDatabaseId: uuid,
    semanticCacheAllowed: true,
    revision,
    snapshotHash: digest({ records, revision }),
    records,
    nextCursor: null,
    liveVerificationPerformed: false,
  };
}
function runtime(value = fingerprint) {
  return {
    fingerprint: value,
    embed: vi.fn<EmbeddingRuntime['embed']>().mockResolvedValue(unit()),
  };
}
function build(
  source: OutcomeProjectionPage,
  model = runtime(),
  previous?: Awaited<ReturnType<typeof buildIndex>>['cache']
) {
  return buildIndex({
    path: 'synthetic',
    readProjection: () => source,
    runtime: model,
    previous,
  });
}

it('computes a first index then reuses unchanged validated vectors without mutating the prior cache', async () => {
  const source = page([record('a'), record('b')]);
  const model = runtime();
  const first = await build(source, model);
  expect(first.stats).toMatchObject({
    computed: 2,
    reused: 0,
    reuseEligible: false,
  });
  expect(first.cache.vectors[0]?.values[0]).toBe(1);
  const before = JSON.stringify(first.cache);
  model.embed.mockClear();
  const second = await build(source, model, first.cache);
  expect(second.stats).toEqual({
    strategy: 'snapshot-reconciled-vector-reuse-v1',
    computed: 0,
    reused: 2,
    removed: 0,
    invalidated: 0,
    reuseEligible: true,
  });
  expect(model.embed).not.toHaveBeenCalled();
  expect(second.cache).toEqual(first.cache);
  expect(JSON.stringify(first.cache)).toBe(before);
});

it('reconciles an advanced snapshot by embedding only a new record and dropping deletions', async () => {
  const a = record('a'),
    b = record('b'),
    c = record('c');
  const model = runtime();
  const first = await build(page([a, b]), model);
  model.embed.mockClear();
  const added = await build(page([a, b, c], 2), model, first.cache);
  expect(added.stats).toMatchObject({
    computed: 1,
    reused: 2,
    removed: 0,
    invalidated: 0,
  });
  expect(model.embed).toHaveBeenCalledTimes(1);
  expect(model.embed.mock.calls[0]?.[2]).toBe('Calendar c');
  model.embed.mockClear();
  const deleted = await build(page([a, c], 3), model, added.cache);
  expect(deleted.stats).toMatchObject({
    computed: 0,
    reused: 2,
    removed: 1,
    invalidated: 0,
  });
  expect(model.embed).not.toHaveBeenCalled();
  expect(deleted.cache.documents.map((document) => document.id)).toEqual([
    'a',
    'c',
  ]);
  expect(deleted.cache.vectors.map((vector) => vector.id)).toEqual(['a', 'c']);
});

it.each([
  { title: 'Changed title' },
  { acceptance: 'New unique criterion' },
  { note: 'New note' },
  { links: ['synthetic:link'] },
  { dependencies: ['b'] },
  { requiredEvidence: ['new evidence'] },
])('invalidates only the changed full record: %j', async (changes) => {
  const b = record('b');
  const first = await build(page([record('a'), b]));
  const model = runtime();
  const next = await build(
    page([record('a', [item('a', changes)]), b], 2),
    model,
    first.cache
  );
  expect(next.stats).toMatchObject({ computed: 1, reused: 1, invalidated: 1 });
  expect(model.embed).toHaveBeenCalledTimes(1);
  expect(next.cache.documents[0]?.contentHash).not.toBe(
    first.cache.documents[0]?.contentHash
  );
  expect(next.cache.documents[1]).toEqual(first.cache.documents[1]);
});

it('treats provenance changes conservatively and preserves every member through merge/split/root changes', async () => {
  const a = item('a'),
    b = item('b'),
    c = record('c');
  const first = await build(page([record('a'), record('b'), c]));
  const model = runtime();
  const provenance = await build(
    page([record('a', [a], 2), record('b'), c], 2),
    model,
    first.cache
  );
  expect(provenance.stats).toMatchObject({
    computed: 1,
    reused: 2,
    invalidated: 1,
  });
  model.embed.mockClear();
  const merged = await build(
    page([record('a', [a, b]), c], 3),
    model,
    first.cache
  );
  expect(merged.stats).toMatchObject({
    computed: 1,
    reused: 1,
    removed: 1,
    invalidated: 1,
  });
  expect(merged.cache.documents[0]?.contributingIds).toEqual(['a', 'b']);
  expect(
    merged.cache.documents[0]?.provenance.map((member) => member.itemId)
  ).toEqual(['a', 'b']);
  expect(merged.cache.documents[0]?.text).toContain(a.acceptance);
  expect(merged.cache.documents[0]?.text).toContain(b.acceptance);
  model.embed.mockClear();
  const rerooted = await build(
    page([record('b', [a, b]), c], 4),
    model,
    merged.cache
  );
  expect(rerooted.stats).toMatchObject({ computed: 1, reused: 1, removed: 1 });
  expect(rerooted.cache.vectors.map((vector) => vector.id)).toEqual(['b', 'c']);
  model.embed.mockClear();
  const split = await build(
    page([record('a'), record('b'), c], 5),
    model,
    rerooted.cache
  );
  expect(split.stats).toMatchObject({ computed: 2, reused: 1, invalidated: 1 });
});

it.each(['model', 'recipe', 'adapter', 'native'])(
  'invalidates every vector when the %s fingerprint changes',
  async (field) => {
    const source = page([record('a'), record('b')]);
    const first = await build(source);
    const model = runtime(
      digest({ model: 1, recipe: 1, adapter: 1, native: 1, [field]: 2 })
    );
    const changed = await build(source, model, first.cache);
    expect(changed.stats).toMatchObject({
      reuseEligible: false,
      computed: 2,
      reused: 0,
      invalidated: 2,
    });
    expect(model.embed).toHaveBeenCalledTimes(2);
  }
);

it('denies reuse on UUID changes, rollback and same-revision snapshot drift', async () => {
  const source = page([record('a'), record('b')], 2);
  const first = await build(source);
  const variants: OutcomeProjectionPage[] = [
    { ...source, sourceDatabaseId: '00000000-0000-4000-8000-000000000002' },
    { ...source, revision: 1 },
    { ...source, snapshotHash: 'f'.repeat(64) },
  ];
  for (const changed of variants) {
    const model = runtime();
    const result = await build(changed, model, first.cache);
    expect(result.stats).toMatchObject({
      reuseEligible: false,
      reused: 0,
      computed: 2,
      invalidated: 2,
    });
    expect(model.embed).toHaveBeenCalledTimes(2);
  }
});

it('clears semantic output without a current runtime, and rejects legacy/version/corrupt prior data before embedding', async () => {
  const source = page([record('a')]);
  const first = await build(source);
  const lexical = await buildIndex({
    path: 'synthetic',
    readProjection: () => source,
    previous: first.cache,
  });
  expect(lexical.cache).toMatchObject({ modelFingerprint: null, vectors: [] });
  expect(lexical.stats).toMatchObject({
    computed: 0,
    reused: 0,
    invalidated: 1,
  });
  expect(lexical.cache.documents).toEqual(first.cache.documents);
  const model = runtime();
  const legacy: OutcomeProjectionPage = {
    ...source,
    sourceDatabaseId: null,
    semanticCacheAllowed: false,
  };
  await expect(build(legacy, model, first.cache)).rejects.toThrow(
    'legacy null identity'
  );
  await expect(
    buildIndex({
      path: 'synthetic',
      runtime: model,
      readProjection: () =>
        outcomeProjectionPageSchema.parse({ ...source, projectionVersion: 2 }),
    })
  ).rejects.toThrow();
  expect(() =>
    cacheSchema.parse({ ...first.cache, projectionVersion: 2 })
  ).toThrow();
  const corrupt = {
    ...first.cache,
    vectors: first.cache.vectors.map((vector) => ({
      ...vector,
      contentHash: 'f'.repeat(64),
    })),
  };
  await expect(build(source, model, corrupt)).rejects.toThrow(
    'vector provenance'
  );
  expect(model.embed).not.toHaveBeenCalled();
});

it('rebuilds old record-only content keys once and fences mixed projection pages', async () => {
  const a = record('a'),
    b = record('b');
  const source = page([a, b]);
  const first = await build(source);
  const oldHash = new Map([a, b].map((row) => [row.id, digest(row)]));
  const old = cacheSchema.parse({
    ...first.cache,
    documents: first.cache.documents.map((document) => ({
      ...document,
      contentHash: oldHash.get(document.id),
    })),
    vectors: first.cache.vectors.map((vector) => ({
      ...vector,
      contentHash: oldHash.get(vector.id),
    })),
  });
  const model = runtime();
  const migrated = await build(source, model, old);
  expect(migrated.stats).toMatchObject({
    computed: 2,
    reused: 0,
    invalidated: 2,
  });
  model.embed.mockClear();
  let reads = 0;
  await expect(
    buildIndex({
      path: 'synthetic',
      runtime: model,
      readProjection: () =>
        ++reads === 1
          ? {
              ...source,
              records: [a],
              nextCursor: {
                projectionVersion: 1,
                sourceDatabaseId: uuid,
                revision: 1,
                snapshotHash: source.snapshotHash,
                afterId: 'a',
              },
            }
          : { ...source, records: [b], revision: 2, nextCursor: null },
    })
  ).rejects.toThrow('mix projection pages');
  expect(model.embed).not.toHaveBeenCalled();
  expect(
    (
      await collectDocuments({
        path: 'synthetic',
        readProjection: () => source,
      })
    ).documents[0]?.text
  ).toContain('unique acceptance a');
});

it('keeps the total eight-record cap and returns no partial semantic cache when embedding fails', async () => {
  const model = runtime();
  await expect(
    build(page(Array.from({ length: 9 }, (_, i) => record(`item-${i}`))), model)
  ).rejects.toThrow('8 records');
  expect(model.embed).not.toHaveBeenCalled();
  model.embed
    .mockResolvedValueOnce(unit())
    .mockRejectedValueOnce(new Error('synthetic engine failure'));
  await expect(build(page([record('a'), record('b')]), model)).rejects.toThrow(
    'local index embedding failed'
  );
  expect(model.embed).toHaveBeenCalledTimes(2);
});
