import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import type { OutcomeProjectionPage } from '../operational-graph/contracts';
import {
  cacheSchema,
  readCache,
  writeCache,
} from '../operational-search/cache';
import * as pythonRuntime from '../operational-search/python-runtime';
import { createRuntimeDiagnosticCollector } from '../operational-search/python-runtime';
import { digest, type Item } from './operational-schema';
import { runOperationalSearch } from './operational-search';

it('reports computed/reused vectors honestly and rejects same-snapshot old content-policy query caches', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-incremental-cli-'))
  );
  const cache = join(directory, 'index.json');
  const fingerprint = 'a'.repeat(64);
  const embed = vi
    .fn()
    .mockResolvedValue(
      Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
    );
  const injected = { readProjection: page, runtime: { fingerprint, embed } };
  try {
    const first = await runOperationalSearch(
      ['index', '--db', 'synthetic', '--cache', cache],
      injected
    );
    expect(first).toMatchObject({
      computed: 1,
      reused: 0,
      embedded: 1,
      modelLoaded: false,
      projectionScan: 'full snapshot',
      lexicalRebuild: 'full snapshot',
    });
    embed.mockClear();
    const second = await runOperationalSearch(
      ['index', '--db', 'synthetic', '--cache', cache],
      injected
    );
    expect(second).toMatchObject({
      computed: 0,
      reused: 1,
      embedded: 1,
      incremental: true,
      modelLoaded: false,
      embeddingAttemptsThisCommand: 0,
      successfulEmbeddingsThisCommand: 0,
    });
    expect(embed).not.toHaveBeenCalled();
    const previous = readCache(cache);
    const oldKey = digest(page().records[0]);
    writeCache(
      cache,
      cacheSchema.parse({
        ...previous,
        documents: previous.documents.map((document) => ({
          ...document,
          contentHash: oldKey,
        })),
        vectors: previous.vectors.map((vector) => ({
          ...vector,
          contentHash: oldKey,
        })),
      })
    );
    expect(
      await runOperationalSearch(
        ['query', 'calendar', '--db', 'synthetic', '--cache', cache],
        injected
      )
    ).toMatchObject({
      mode: 'lexical',
      cacheStatus: 'stale-content-policy',
      results: [{ id: item.id, actionAuthorized: false }],
    });
    expect(embed).not.toHaveBeenCalled();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('separates this-command load evidence from reused and partially failed committed vectors using a fake factory', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-load-receipt-'))
  );
  const cache = join(directory, 'index.json');
  const fingerprint = 'a'.repeat(64);
  const embed = vi
    .fn()
    .mockResolvedValue(
      Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
    );
  const factory = vi
    .spyOn(pythonRuntime, 'createPythonRuntime')
    .mockResolvedValue({ fingerprint, embed });
  const args = [
    'index',
    '--db',
    'synthetic',
    '--cache',
    cache,
    '--runtime-dir',
    'synthetic-fake-runtime',
  ];
  try {
    expect(
      await runOperationalSearch(args, { readProjection: page })
    ).toMatchObject({
      modelLoaded: true,
      computed: 1,
      successfulEmbeddingsThisCommand: 1,
      embedded: 1,
    });
    embed.mockClear();
    expect(
      await runOperationalSearch(args, { readProjection: page })
    ).toMatchObject({
      modelLoaded: false,
      computed: 0,
      reused: 1,
      successfulEmbeddingsThisCommand: 0,
      embedded: 1,
    });
    expect(embed).not.toHaveBeenCalled();
    const source = page();
    const first = source.records[0];
    if (!first) throw new Error('missing synthetic record');
    const secondItem = {
      ...item,
      id: 'calendar-reminder',
      title: 'Calendar reminder',
      acceptance: 'Never change RSVP',
    };
    const second = {
      ...first,
      id: secondItem.id,
      canonicalId: secondItem.id,
      contributingIds: [secondItem.id],
      members: first.members.map((member) => ({
        ...member,
        item: secondItem,
        provenance: { ...member.provenance, itemId: secondItem.id },
      })),
    };
    const changed = {
      ...first,
      members: first.members.map((member) => ({
        ...member,
        item: { ...member.item, note: 'synthetic changed record' },
      })),
    };
    const current = {
      ...source,
      revision: 2,
      snapshotHash: 'b'.repeat(64),
      records: [changed, second],
    };
    embed
      .mockResolvedValueOnce(
        Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
      )
      .mockRejectedValueOnce(new Error('synthetic failure'));
    expect(
      await runOperationalSearch(args, { readProjection: () => current })
    ).toMatchObject({
      modelLoaded: true,
      embedded: 0,
      computed: 0,
      reused: 0,
      successfulEmbeddingsThisCommand: 1,
      embeddingAttemptsThisCommand: 2,
      runtimeFallback: 'LOCAL_EMBEDDING_FAILED',
    });
    expect(readCache(cache).vectors).toEqual([]);
    factory.mockRejectedValue(new Error('synthetic revoked runtime'));
    expect(
      await runOperationalSearch(args, { readProjection: () => current })
    ).toMatchObject({
      modelLoaded: false,
      embedded: 0,
      modelFingerprint: null,
      runtimeFallback: 'LOCAL_RUNTIME_UNAVAILABLE',
    });
  } finally {
    factory.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('does not publish on a final identity/revision/hash/cache-permission conflict or repair a foreign file', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-reconcile-conflict-'))
  );
  const cache = join(directory, 'index.json');
  const embed = vi
    .fn()
    .mockResolvedValue(
      Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
    );
  const runtime = { fingerprint: 'a'.repeat(64), embed };
  try {
    await runOperationalSearch(
      ['index', '--db', 'synthetic', '--cache', cache],
      { readProjection: page, runtime }
    );
    const before = readFileSync(cache);
    const source = page();
    const legacy: OutcomeProjectionPage = {
      ...source,
      sourceDatabaseId: null,
      semanticCacheAllowed: false,
    };
    for (const conflict of [
      { ...source, revision: 2 },
      { ...source, snapshotHash: 'b'.repeat(64) },
      { ...source, sourceDatabaseId: '00000000-0000-4000-8000-000000000002' },
      legacy,
    ]) {
      let reads = 0;
      await expect(
        runOperationalSearch(['index', '--db', 'synthetic', '--cache', cache], {
          runtime,
          readProjection: () => (++reads === 1 ? source : conflict),
        })
      ).rejects.toThrow('source changed');
      expect(readFileSync(cache)).toEqual(before);
    }
    let pageReads = 0;
    await expect(
      runOperationalSearch(['index', '--db', 'synthetic', '--cache', cache], {
        runtime,
        readProjection: () =>
          ++pageReads === 1
            ? {
                ...source,
                nextCursor: {
                  projectionVersion: 1,
                  sourceDatabaseId: source.sourceDatabaseId,
                  revision: source.revision,
                  snapshotHash: source.snapshotHash,
                  afterId: item.id,
                },
              }
            : { ...source, revision: 2, records: [], nextCursor: null },
      })
    ).rejects.toThrow('mix projection pages');
    expect(pageReads).toBe(2);
    expect(readFileSync(cache)).toEqual(before);
    const foreign = join(directory, 'foreign.json');
    writeFileSync(foreign, 'synthetic foreign owner', { mode: 0o600 });
    embed.mockClear();
    await expect(
      runOperationalSearch(['index', '--db', 'synthetic', '--cache', foreign], {
        runtime,
        readProjection: page,
      })
    ).rejects.toThrow();
    expect(embed).not.toHaveBeenCalled();
    expect(readFileSync(foreign, 'utf8')).toBe('synthetic foreign owner');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const item: Item = {
  id: 'calendar-rsvp',
  title: 'Calendar RSVP',
  kind: 'feature',
  source: 'synthetic:cli',
  acceptance: 'Persist responses offline',
  priority: 0,
  dependencies: [],
  requiredEvidence: ['focused'],
  status: 'captured',
  owner: '',
  links: [],
  note: '',
};

it('exposes only typed redacted runtime failures while preserving lexical index and query fallback', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-diagnostic-cli-'))
  );
  const cache = join(directory, 'index.json');
  const collector = createRuntimeDiagnosticCollector();
  collector.receive(
    Buffer.from('synthetic-private-prompt signed-url credential')
  );
  const known = collector.failure(1, null);
  const fake = Object.assign(new Error('synthetic-private-error'), {
    diagnostic: { prompt: 'synthetic-private-prompt' },
  });
  const fingerprint = 'a'.repeat(64);
  try {
    for (const error of [known, fake]) {
      const response = await runOperationalSearch(
        ['index', '--db', 'synthetic', '--cache', cache],
        {
          readProjection: page,
          runtime: {
            fingerprint,
            async embed() {
              throw error;
            },
          },
        }
      );
      expect(response).toMatchObject({
        indexed: 1,
        embedded: 0,
        modelLoaded: false,
        runtimeFallback: 'LOCAL_EMBEDDING_FAILED',
        runtimeFailureDiagnostic: error === known ? known.diagnostic : null,
      });
      expect(JSON.stringify(response)).not.toContain('synthetic-private');
    }
    await runOperationalSearch(
      ['index', '--db', 'synthetic', '--cache', cache],
      {
        readProjection: page,
        runtime: {
          fingerprint,
          async embed() {
            return Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
          },
        },
      }
    );
    const response = await runOperationalSearch(
      ['query', 'calendar', '--db', 'synthetic', '--cache', cache],
      {
        readProjection: page,
        runtime: {
          fingerprint,
          async embed() {
            throw known;
          },
        },
      }
    );
    expect(response).toMatchObject({
      mode: 'lexical',
      fallbackReason: 'SEMANTIC_RUNTIME_FAILED',
      runtimeFailureDiagnostic: known.diagnostic,
      results: [{ id: item.id, actionAuthorized: false }],
    });
    expect(JSON.stringify(response)).not.toContain('synthetic-private');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
function page(): OutcomeProjectionPage {
  return {
    projectionVersion: 1,
    sourceDatabaseId: '00000000-0000-4000-8000-000000000001',
    revision: 1,
    snapshotHash: digest(item),
    semanticCacheAllowed: true,
    records: [
      {
        id: item.id,
        canonicalId: item.id,
        contributingIds: [item.id],
        members: [
          {
            item,
            provenance: {
              itemId: item.id,
              source: item.source,
              firstEventSeq: 1,
              lastEventSeq: 1,
              events: [
                {
                  seq: 1,
                  at: 'synthetic',
                  action: 'intake',
                  payloadHash: digest(item),
                },
              ],
            },
          },
        ],
      },
    ],
    nextCursor: null,
    liveVerificationPerformed: false,
  };
}

it('serves EN/VI help and denies model preparation without touching a store or network', async () => {
  expect(await runOperationalSearch(['--help', '--lang', 'vi'])).toMatchObject({
    group: 'backlog search',
    help: expect.stringContaining('Tìm kiếm'),
  });
  expect(await runOperationalSearch(['model-status', '--json'])).toMatchObject({
    ready: false,
    downloadPerformed: false,
    runtimeExecuted: false,
  });
  await expect(runOperationalSearch(['model-prepare'])).rejects.toThrow(
    '--runtime-dir'
  );
  await expect(runOperationalSearch(['query', 'calendar'])).rejects.toThrow(
    '--db'
  );
  await expect(
    runOperationalSearch([
      'query',
      'calendar',
      '--db',
      'fixture',
      '--db',
      'other',
    ])
  ).rejects.toThrow('duplicate');
});

it('indexes and queries a private injected native projection, then invalidates changed revisions', async () => {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), 'ttr-search-cli-'))
  );
  const cache = join(directory, 'index.json');
  let source = page();
  const injected = { readProjection: () => source };
  try {
    expect(
      await runOperationalSearch(
        ['index', '--db', 'synthetic', '--cache', cache],
        injected
      )
    ).toMatchObject({
      indexed: 1,
      embedded: 0,
      incremental: false,
      revision: 1,
    });
    expect(statSync(cache).mode & 0o777).toBe(0o600);
    expect(
      await runOperationalSearch(
        ['query', 'calendar', '--db', 'synthetic', '--cache', cache],
        injected
      )
    ).toMatchObject({
      cacheStatus: 'current',
      mode: 'lexical',
      results: [{ id: item.id, actionAuthorized: false }],
    });
    source = { ...source, revision: 2, snapshotHash: 'b'.repeat(64) };
    expect(
      await runOperationalSearch(
        ['query', 'calendar', '--db', 'synthetic', '--cache', cache],
        injected
      )
    ).toMatchObject({ cacheStatus: 'stale', revision: 2, mode: 'lexical' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('permits ephemeral legacy lexical reads but refuses persistent cache and mixed pages', async () => {
  const native = page();
  const legacy: OutcomeProjectionPage = {
    ...native,
    sourceDatabaseId: null,
    semanticCacheAllowed: false,
  };
  expect(
    await runOperationalSearch(['query', 'calendar', '--db', 'synthetic'], {
      readProjection: () => legacy,
    })
  ).toMatchObject({ sourceDatabaseId: null, mode: 'lexical' });
  await expect(
    runOperationalSearch(
      ['index', '--db', 'synthetic', '--cache', '/never-written'],
      { readProjection: () => legacy }
    )
  ).rejects.toThrow('legacy null identity');
  let count = 0;
  await expect(
    runOperationalSearch(['query', 'calendar', '--db', 'synthetic'], {
      readProjection: () =>
        ++count === 1
          ? {
              ...native,
              nextCursor: {
                projectionVersion: 1,
                sourceDatabaseId: native.sourceDatabaseId,
                revision: 1,
                snapshotHash: native.snapshotHash,
                afterId: item.id,
              },
            }
          : { ...native, revision: 2 },
    })
  ).rejects.toThrow('mix projection pages');
});
