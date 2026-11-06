import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DevboxFleetRunner,
  DevboxFleetSnapshot,
} from '../devbox-fleet-types';
import { diskAdmission } from './resources-disk-admission';
import type { AutoReclaimOutcome } from './storage-auto-reclaim';
import { fleetStorage, renderFleetStorage } from './storage-fleet';
import {
  defaultStorageThresholds,
  GiB,
  type VolumeProbe,
} from './storage-headroom';
import {
  hysteresisThresholds,
  nextVolumeState,
  recordVolumeState,
} from './storage-hysteresis';
import type { ReclaimResult } from './storage-reclaim';

const volume = (freeGiB: number, path = '/w'): VolumeProbe => ({
  path,
  device: 7,
  totalBytes: 500 * GiB,
  freeBytes: freeGiB * GiB,
  usedBytes: (500 - freeGiB) * GiB,
  freePercent: (freeGiB / 500) * 100,
  inodesTotal: null,
  inodesFree: null,
  inodeFreePercent: null,
});
const isolated = async (extra: NodeJS.ProcessEnv = {}) => ({
  TTR_RESOURCES_MIN_FREE_GIB: '0',
  TTR_STORAGE_MIN_FREE_PERCENT: '5',
  TTR_STORAGE_RECOVER_FREE_PERCENT: '10',
  TTR_STORAGE_HOME: await mkdtemp(join(tmpdir(), 'ttr-hysteresis-')),
  TTR_STORAGE_HOST_ID: 'mac-1',
  ...extra,
});

describe('hysteresis and alert dedupe', () => {
  const thresholds = hysteresisThresholds({});

  it('enters low below the minimum and leaves only at the separate recover threshold', () => {
    // Defaults: low below 15 GiB / 5%, recover at 30 GiB / 10%.
    expect(thresholds.recover.minFreeBytes).toBe(30 * GiB);
    expect(nextVolumeState('ok', volume(20), thresholds).state).toBe('low');
    expect(nextVolumeState('ok', volume(60), thresholds).state).toBe('ok');
    // 40 GiB is 8%: fine coming from ok, still recovering coming from low.
    const band = volume(40);
    expect(nextVolumeState('ok', band, thresholds).state).toBe('ok');
    const recovering = nextVolumeState('low', band, thresholds);
    expect(recovering.state).toBe('low');
    expect(recovering.reasons[0]).toMatch(/not yet recovered/u);
    expect(nextVolumeState('low', volume(50), thresholds).state).toBe('ok');
  });

  it('reads configurable recover thresholds and never lets recover sit below low', () => {
    const custom = hysteresisThresholds({
      TTR_STORAGE_MIN_FREE: '40G',
      TTR_STORAGE_RECOVER_FREE: '20G',
      TTR_STORAGE_RECOVER_FREE_PERCENT: 'lots',
    });
    expect(custom.recover.minFreeBytes).toBe(41 * GiB);
    expect(custom.warnings).toHaveLength(1);
  });

  it('alerts once per host, volume and level', async () => {
    const env = await isolated();
    const opts = { home: env.TTR_STORAGE_HOME, host: 'mac-1' };
    const levels = [100, 40, 41, 10, 9, 40, 60, 61].map((free) => {
      const result = recordVolumeState(volume(free), thresholds, opts);
      return `${result.level}:${result.alert ? 'alert' : '-'}`;
    });
    expect(levels).toEqual([
      'ok:-',
      'warn:alert',
      'warn:-',
      'low:alert',
      'low:-',
      // Still low inside the band; recovery alerts exactly once.
      'low:-',
      'ok:alert',
      'ok:-',
    ]);
  });
});

const outcome = (result: Partial<ReclaimResult>): AutoReclaimOutcome => ({
  note: null,
  result: {
    status: 'insufficient',
    host: 'mac-1',
    orchestrator: 'tuturuuu',
    trigger: 'admission',
    before: volume(10),
    after: volume(10),
    freedBytes: 0,
    items: [],
    ...result,
  },
});

describe('admission with automatic reclaim', () => {
  it('admits after reclaim reaches the recover thresholds', async () => {
    let calls = 0;
    const result = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: async () => volume(10),
      reclaim: async () => {
        calls += 1;
        return outcome({
          status: 'recovered',
          after: volume(80),
          freedBytes: 70 * GiB,
        });
      },
    });
    expect(calls).toBe(1);
    expect(result.refuse).toBe(false);
    expect(result.message).toMatch(/recovered on mac-1 by automatic reclaim/u);
  });

  it('blocks with owners, manual candidates and the resume condition when safe reclaim is not enough', async () => {
    const result = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: async () => volume(10),
      reclaim: async () =>
        outcome({
          after: volume(12),
          freedBytes: 2 * GiB,
          manifest: '/h/reclaim/mac-1/receipts/run.jsonl',
          items: [
            {
              rule: 'xcode-derived-data-idle',
              path: '/u/DerivedData/App',
              owner: 'machine user (Xcode build cache)',
              bytes: 2 * GiB,
              status: 'done',
              freedBytes: 2 * GiB,
            },
            {
              rule: 'merged-worktree-artifact',
              path: '/r/wt/.next',
              owner: 'tuturuuu (merged feat/x)',
              bytes: 9 * GiB,
              status: 'skipped',
              reason: 'a process has files open under /r/wt',
            },
          ],
        }),
      holds: async () => [{ path: '/r/held-wt', owner: 'upskii', glob: false }],
      suggestions: async () => [
        {
          category: 'worktrees',
          title: 'Remove merged worktree held-wt',
          path: '/r/held-wt',
          reclaimableBytes: 40 * GiB,
          risk: 'review',
          command: 'ttr storage prune --category worktrees --apply',
          apply: 'named',
        },
      ],
    });
    expect(result).toMatchObject({ pressure: 'critical', refuse: true });
    const message = result.message ?? '';
    expect(message).toContain('refusing a heavy command on mac-1');
    expect(message).toContain('insufficient, freed 2.0GiB from 1 item(s)');
    expect(message).toContain('/h/reclaim/mac-1/receipts/run.jsonl');
    expect(message).toMatch(
      /9\.0GiB \/r\/wt\/\.next\n\s+owner: tuturuuu \(merged feat\/x\); skipped: a process has files open/u
    );
    expect(message).toMatch(
      /40GiB \[review\] Remove merged worktree held-wt \/r\/held-wt\n\s+owner: held by upskii; ask that owner to release it/u
    );
    expect(message).toMatch(
      /Resume: heavy admission reopens once this volume has at least 30GiB and 10% free \(about 38GiB more\)/u
    );
  });

  it('reports the live lease holder instead of reclaiming in parallel', async () => {
    const result = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: async () => volume(10),
      reclaim: async () =>
        outcome({
          status: 'contended',
          before: null,
          after: null,
          reason:
            'cleanup lease held by pid 42 on mac-1 for mastermind since 2026-10-23T04:00:00.000Z (heartbeat)',
        }),
      holds: async () => [],
      suggestions: async () => null,
    });
    expect(result.refuse).toBe(true);
    expect(result.message).toContain(
      'lease of this storage authority held by another caller'
    );
    expect(result.message).toContain('for mastermind');
    expect(result.message).toContain('run ttr storage suggest');
  });

  it('keeps refusing inside the hysteresis band and explains a cooldown', async () => {
    const env = await isolated();
    const note =
      'the last run at 2026-10-23T04:00:00.000Z (admission) was insufficient';
    const reclaim = async () => ({ result: null, note });
    const base = {
      cwd: '/w',
      env,
      reclaim,
      holds: async () => [],
      suggestions: async () => null,
    };
    expect(
      (await diskAdmission({ ...base, probe: async () => volume(10) })).refuse
    ).toBe(true);
    const band = await diskAdmission({
      ...base,
      probe: async () => volume(40),
    });
    expect(band.refuse).toBe(true);
    expect(band.message).toContain('not yet recovered');
    expect(band.message).toContain(`Automatic reclaim not run: ${note}`);
    const clear = await diskAdmission({
      ...base,
      probe: async () => volume(60),
    });
    expect(clear).toMatchObject({ refuse: false });
    expect(clear.message).toMatch(/recovered on mac-1/u);
  });

  it('refuses a failed probe as UNKNOWN and never reclaims', async () => {
    let calls = 0;
    const result = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: async () => {
        throw new Error('statfs EIO');
      },
      reclaim: async () => {
        calls += 1;
        return { result: null, note: null };
      },
    });
    expect(result).toMatchObject({ pressure: 'unknown', refuse: true });
    expect(result.message).toContain('UNKNOWN');
    expect(result.message).toContain('--ignore-disk');
    expect(calls).toBe(0);
  });
});

describe('fleet telemetry freshness', () => {
  const now = Date.parse('2026-10-23T04:00:00.000Z');
  const runner = (
    id: string,
    overrides: Partial<DevboxFleetRunner> = {}
  ): DevboxFleetRunner => ({
    id,
    name: id,
    status: 'online',
    heartbeat_enabled: true,
    last_heartbeat_at: new Date(now - 5_000).toISOString(),
    enabled_features: { run: true, build: true, judge: false },
    resource_limits: null,
    capabilities: {
      executionMode: 'trusted',
      os: { hostname: `${id}.local`, platform: 'darwin' },
      resources: { disk: { freeGiB: 200, freePct: 40 } },
    },
    drain_requested_at: null,
    activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
    ...overrides,
  });

  it('reports stale, offline or unreachable hosts as UNKNOWN, never healthy', () => {
    const snapshot: DevboxFleetSnapshot = {
      server_time: new Date(now).toISOString(),
      runners: [
        runner('fresh'),
        runner('stale', {
          last_heartbeat_at: new Date(now - 10 * 60_000).toISOString(),
        }),
        runner('offline', { status: 'offline' }),
        runner('never', { last_heartbeat_at: null }),
      ],
      runs: [],
      leases: [],
    };
    const rows = fleetStorage(snapshot, defaultStorageThresholds);
    expect(rows.map((row) => [row.id, row.pressure])).toEqual([
      ['stale', 'unknown'],
      ['offline', 'unknown'],
      ['never', 'unknown'],
      ['fresh', 'ok'],
    ]);
    expect(rows[0]?.reasons[0]).toMatch(/disk state unknown/u);
    expect(renderFleetStorage(rows)).toContain(
      'UNKNOWN: no fresh heartbeat, last report is not trusted'
    );
  });
});
