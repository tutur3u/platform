import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { LiveData } from './model.ts';
import type { Track } from './status.ts';
import type { HostingSnapshot } from './hosting.ts';
import { buildView } from '../view-model.ts';
import {
  CACHE_KEY,
  forgetRuntimeSnapshot,
  freshRuntime,
  MAX_SNAPSHOT_CHARS,
  readRuntimeSnapshot,
  REFRESH_MS,
  runtimeObservation,
  refreshRuntime,
  requireCompleteHosts,
  writeRuntimeSnapshot,
} from './runtime-refresh.ts';

const started = Date.parse('2026-11-13T12:00:00Z');
const build = 'a'.repeat(40);
const initial: LiveData = {
  schema: 1,
  generatedAt: new Date(started - 86_400_000).toISOString(),
  source: 'build',
  main: null,
  prs: [],
  hosts: [],
};
const observation: LiveData = {
  ...initial,
  source: 'live',
  generatedAt: new Date(started).toISOString(),
  main: { sha: 'b'.repeat(40), at: new Date(started).toISOString() },
};

function memory() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

describe('runtime snapshot expiry and fallback', () => {
  it('fake clock: accepts through 29:59.999 and falls back at exactly 30:00', () => {
    const storage = memory();
    writeRuntimeSnapshot(storage, observation, build);
    assert.deepEqual(
      readRuntimeSnapshot(storage, initial, build, started + REFRESH_MS - 1),
      observation
    );
    assert.equal(
      readRuntimeSnapshot(storage, initial, build, started + REFRESH_MS),
      initial
    );
    assert.equal(REFRESH_MS, 1_800_000);
  });

  it('rejects future time and an observation older than this build', () => {
    assert.equal(freshRuntime(observation, initial, started - 1), false);
    assert.equal(
      freshRuntime(
        observation,
        { ...initial, generatedAt: new Date(started + 1).toISOString() },
        started + 2
      ),
      false
    );
    assert.equal(freshRuntime(initial, initial, started), false);
  });

  it('missing, corrupt, oversized and other-build storage use the actual current build', () => {
    const storage = memory();
    for (const raw of [
      null,
      '{',
      'null',
      '{}',
      'x'.repeat(MAX_SNAPSHOT_CHARS + 1),
      JSON.stringify({ build: 'old', data: observation }),
      JSON.stringify({ build, data: { ...observation, main: null } }),
      JSON.stringify({
        build,
        data: { ...observation, prs: [{ number: -1 }] },
      }),
    ]) {
      if (raw === null) storage.removeItem(CACHE_KEY);
      else storage.setItem(CACHE_KEY, raw);
      assert.equal(
        readRuntimeSnapshot(storage, initial, build, started),
        initial
      );
    }
    const currentBuild = {
      ...initial,
      generatedAt: new Date(started + 1).toISOString(),
    };
    writeRuntimeSnapshot(storage, observation, build);
    assert.equal(
      readRuntimeSnapshot(storage, currentBuild, build, started + 2),
      currentBuild
    );
  });

  it('blocked storage is optional and invalidation discards a cached success', () => {
    const storage = memory();
    writeRuntimeSnapshot(storage, observation, build);
    forgetRuntimeSnapshot(storage);
    assert.equal(
      readRuntimeSnapshot(storage, initial, build, started),
      initial
    );
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.equal(readRuntimeSnapshot(denied, initial, build, started), initial);
    assert.doesNotThrow(() => writeRuntimeSnapshot(denied, observation, build));
    assert.doesNotThrow(() => forgetRuntimeSnapshot(denied));
  });

  it('bounds writes and removes an earlier snapshot when the new value is too large', () => {
    const storage = memory();
    writeRuntimeSnapshot(storage, observation, build);
    writeRuntimeSnapshot(
      storage,
      { ...observation, generatedAt: 'x'.repeat(MAX_SNAPSHOT_CHARS) },
      build
    );
    assert.equal(storage.getItem(CACHE_KEY), null);
  });

  it('validates refreshes and merges only current-build facts', () => {
    assert.throws(() =>
      runtimeObservation(initial, { ...observation, main: null }, started)
    );
    assert.throws(() =>
      runtimeObservation(initial, observation, started + REFRESH_MS)
    );
    assert.throws(() =>
      runtimeObservation(
        initial,
        { ...observation, hosts: [{ app: 'invalid' }] } as LiveData,
        started
      )
    );
    const next = runtimeObservation(initial, observation, started);
    assert.equal(next.source, 'live');
    assert.equal(next.generatedAt, observation.generatedAt);
    assert.deepEqual(next.main, observation.main);
  });

  it('negative wiring: failure and backoff restore the build; no new polling mechanism', () => {
    const source = readFileSync(
      new URL('./use-live-data.ts', import.meta.url),
      'utf8'
    );
    assert.match(
      source,
      /catch \{\s*if \(version !== generation.current\) return;\s*apply\(initial\);/
    );
    assert.match(source, /backoffActive\(started\)\) \{\s*apply\(initial\);/);
    assert.match(source, /refreshRuntime\(\s*initial,\s*async/);
    assert.match(source, /hosts.status !== 'fulfilled'/);
    assert.match(source, /requireCompleteHosts\(/);
    assert.match(source, /version !== generation.current/);
    assert.match(source, /forgetRuntimeSnapshot\(window.localStorage\)/);
    assert.equal(source.match(/window.setInterval\(/g)?.length, 2);
    assert.doesNotMatch(source, /writeCache|readCache|mergeLiveData\(base/);
  });
});

// The production page passes BUILD_HOSTING: provider classification stays build-owned.
describe('changed public facts through the actual view model', () => {
  const tracks: Track[] = [
    {
      id: 'tasks',
      name: 'Tasks',
      summary: '',
      milestones: [
        {
          id: 'release',
          title: 'Release',
          deliverables: [
            {
              id: 'one',
              title: 'One',
              prs: [1],
              app: 'tasks',
              fallback: 'planned',
            },
          ],
        },
      ],
    },
  ];
  const hosting: HostingSnapshot = {
    checkedAt: initial.generatedAt,
    mode: 'probed',
    registry: {},
    migration: [],
    providers: [
      { app: 'tasks', provider: 'workers' },
      { app: 'mail', provider: 'vercel' },
    ],
  };
  const mergedAt = new Date(started - 60_000).toISOString();
  const base: LiveData = {
    ...initial,
    hosts: [
      {
        app: 'tasks',
        platform: 'vercel',
        commit: 'c'.repeat(40),
        commitAt: initial.generatedAt,
        behindBy: 2,
      },
    ],
  };
  const fresh: LiveData = {
    ...observation,
    prs: [
      {
        number: 1,
        title: 'feat(tasks): ship task lists',
        state: 'merged',
        draft: false,
        approved: false,
        mergedAt,
      },
    ],
    hosts: [
      {
        app: 'tasks',
        platform: 'vercel',
        commit: 'd'.repeat(40),
        commitAt: observation.generatedAt,
        behindBy: 0,
      },
    ],
  };

  it('same build: planned → waiting → live and shipped count recompute', async () => {
    const before = buildView(base, started, tracks, hosting);
    assert.equal(before.totals.planned, 1);
    const waiting = await refreshRuntime(
      base,
      async () => ({ ...fresh, hosts: base.hosts }),
      () => started
    );
    const waitingView = buildView(waiting.data, started, tracks, hosting);
    assert.equal(waitingView.totals.waiting_for_prod_sync, 1);
    assert.equal(waitingView.recent.length, 1);
    const success = await refreshRuntime(
      base,
      async () => fresh,
      () => started
    );
    const after = buildView(success.data, started, tracks, hosting);
    assert.equal(after.totals.live, 1);
    assert.equal(after.totals.waiting_for_prod_sync, 0);
    assert.equal(after.recent.length, 1);
    assert.equal(success.data.main?.sha, fresh.main?.sha);
    assert.equal(success.data.generatedAt, fresh.generatedAt);
    assert.equal(after.onWorkers, 1);
    assert.equal(
      after.hosts.filter((host) => host.platform === 'vercel').length,
      1
    );
    assert.equal(before.onWorkers, after.onWorkers);
  });

  it('rejects whole/partial read failures without relabeling build hosts or time', async () => {
    for (const error of [
      'GitHub 429',
      'hosts 503',
      'Incomplete host compare',
    ]) {
      const result = await refreshRuntime(
        base,
        async () => {
          throw new Error(error);
        },
        () => started
      );
      assert.equal(result.state, 'failed');
      assert.equal(result.data, base);
      assert.equal(result.data.generatedAt, initial.generatedAt);
      assert.deepEqual(result.data.hosts, base.hosts);
      assert.equal(
        buildView(result.data, started, tracks, hosting).totals.planned,
        1
      );
    }
  });

  it('negative: a malformed new observation cannot fabricate an as-of timestamp', async () => {
    const result = await refreshRuntime(
      base,
      async () => ({
        ...fresh,
        generatedAt: new Date(started + 1).toISOString(),
      }),
      () => started
    );
    assert.equal(result.data, base);
    assert.equal(result.state, 'failed');
    const olderHost = { ...fresh.hosts[0]!, platform: 'workers' as const };
    const runtime = await refreshRuntime(
      base,
      async () => ({ ...fresh, hosts: [olderHost] }),
      () => started
    );
    // The view intentionally trusts the build's classification, not runtime flips.
    assert.equal(
      buildView(runtime.data, started, tracks, hosting).onWorkers,
      1
    );
    assert.equal(
      buildView(runtime.data, started, tracks, hosting).hosts.find(
        (host) => host.app === 'mail'
      )?.platform,
      'vercel'
    );
  });
});

describe('partial host observations', () => {
  it('rejects missing, unknown, duplicate, commitless, stale and future probes', () => {
    const host = {
      app: 'roadmap',
      platform: 'workers' as const,
      commit: build,
    };
    const valid = { checkedAt: observation.generatedAt, hosts: [host] };
    assert.doesNotThrow(() =>
      requireCompleteHosts(valid, ['roadmap'], started)
    );
    for (const payload of [
      { ...valid, hosts: [] },
      { ...valid, hosts: [host, host] },
      { ...valid, hosts: [{ ...host, platform: 'unknown' as const }] },
      { ...valid, hosts: [{ ...host, commit: null }] },
      { ...valid, checkedAt: new Date(started - REFRESH_MS).toISOString() },
      { ...valid, checkedAt: new Date(started + 1).toISOString() },
    ])
      assert.throws(() => requireCompleteHosts(payload, ['roadmap'], started));
    assert.throws(
      () =>
        runtimeObservation(
          initial,
          { ...observation, generatedAt: 'x'.repeat(MAX_SNAPSHOT_CHARS + 1) },
          started
        ),
      /too large/
    );
  });
});
