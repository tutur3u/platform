import { mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { OutcomeProjectionPage } from '../operational-graph/contracts';
import { createRuntimeDiagnosticCollector } from '../operational-search/python-runtime';
import { digest, type Item } from './operational-schema';
import { runOperationalSearch } from './operational-search';

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
