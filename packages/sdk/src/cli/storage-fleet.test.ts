import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  DevboxFleetRunner,
  DevboxFleetSnapshot,
} from '../devbox-fleet-types';
import {
  runnerDiskCritical,
  selectOffloadRunner,
} from './resources-box-offload';
import { diskAdmission } from './resources-disk-admission';
import { fleetStorage, renderFleetStorage } from './storage-fleet';
import { defaultStorageThresholds, GiB } from './storage-headroom';

const now = Date.parse('2026-10-23T02:00:00.000Z');
function runner(
  id: string,
  disk?: unknown,
  overrides: Partial<DevboxFleetRunner> = {}
): DevboxFleetRunner {
  return {
    id,
    name: id,
    status: 'online',
    heartbeat_enabled: true,
    last_heartbeat_at: new Date(now - 5_000).toISOString(),
    enabled_features: { run: true, build: true, judge: false },
    resource_limits: null,
    capabilities: {
      executionMode: 'trusted',
      protocols: { commitRun: [1] },
      os: { hostname: `${id}.local`, platform: 'linux' },
      ...(disk === undefined ? {} : { resources: { disk } }),
    },
    drain_requested_at: null,
    activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
    ...overrides,
  };
}
const snapshot = (runners: DevboxFleetRunner[]): DevboxFleetSnapshot => ({
  runners,
  runs: [],
  leases: [],
});

describe('offload selection by reported disk', () => {
  it('skips a trusted runner reporting critical disk and keeps unreported ones eligible', () => {
    const full = runner('full', { freeGiB: 10, freePct: 50 });
    const quiet = runner('quiet', undefined, {
      activity: { queued_runs: 3, running_runs: 1, active_leases: 1 },
    });
    expect(runnerDiskCritical(full)).toMatch(/free/u);
    expect(runnerDiskCritical(quiet)).toBeNull();
    // A malformed report is ignored rather than trusted.
    expect(
      runnerDiskCritical(runner('odd', { freeGiB: '10', freePct: 50 }))
    ).toBeNull();
    const selection = selectOffloadRunner(snapshot([full, quiet]), 'auto', now);
    expect('runner' in selection && selection.runner.id).toBe('quiet');
  });

  it('explains low_disk when every trusted runner is critical', () => {
    const selection = selectOffloadRunner(
      snapshot([runner('full', { freeGiB: 5, freePct: 0 })]),
      'auto',
      now
    );
    expect(selection).toMatchObject({ blockedBy: 'low_disk' });
    expect(
      selectOffloadRunner(
        snapshot([runner('full', { freeGiB: 5, freePct: 0 })]),
        'full',
        now
      )
    ).toMatchObject({ blockedBy: 'low_disk' });
  });
});

describe('fleet storage view', () => {
  it('ranks critical hosts first and flags unreported agents', () => {
    const rows = fleetStorage(
      snapshot([
        runner('healthy', { freeGiB: 200, freePct: 40 }),
        runner('legacy'),
        runner('full', { freeGiB: 10, freePct: 50, inodeFreePct: 90 }),
        runner('gone', { freeGiB: 0, freePct: 0 }, { status: 'revoked' }),
      ]),
      defaultStorageThresholds,
      now
    );
    expect(rows.map((row) => [row.id, row.pressure])).toEqual([
      ['full', 'critical'],
      ['healthy', 'ok'],
      ['legacy', 'unreported'],
    ]);
    const text = renderFleetStorage(rows);
    expect(text).toContain('LOW-DISK: skipped by offload');
    expect(text).toContain('disk not reported');
  });
});

describe('ttr resources disk admission', () => {
  // Hermetic: a private storage home and no real reclaim.
  const isolated = async () => ({
    TTR_RESOURCES_MIN_FREE_GIB: '0',
    TTR_STORAGE_HOME: await mkdtemp(join(tmpdir(), 'ttr-admission-')),
  });
  const reclaim = async () => ({ result: null, note: 'stubbed' });
  const holds = async () => [];
  const probe =
    (freeGiB: number, totalGiB = 500) =>
    async (path: string) => ({
      path,
      device: 1,
      totalBytes: totalGiB * GiB,
      freeBytes: freeGiB * GiB,
      usedBytes: (totalGiB - freeGiB) * GiB,
      freePercent: (freeGiB / totalGiB) * 100,
      inodesTotal: null,
      inodesFree: null,
      inodeFreePercent: null,
    });

  it('admits ok volumes silently and warns on low ones', async () => {
    expect(
      await diskAdmission({
        cwd: '/w',
        env: await isolated(),
        probe: probe(200),
        reclaim,
      })
    ).toEqual({ pressure: 'ok', refuse: false, message: null });
    const low = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: probe(40),
      reclaim,
    });
    expect(low).toMatchObject({ pressure: 'low', refuse: false });
    expect(low.message).toMatch(/ttr storage suggest/u);
  });

  it('refuses at critical with the cached non-high suggestions', async () => {
    const result = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: probe(10),
      reclaim,
      holds,
      suggestions: async () => [
        {
          category: 'trash',
          title: 'Empty Trash',
          path: '',
          reclaimableBytes: 9 * GiB,
          risk: 'high',
          command: 'Finder',
          apply: 'manual',
        },
        {
          category: 'xcode-derived-data',
          title: 'Remove DerivedData',
          path: '',
          reclaimableBytes: 4 * GiB,
          risk: 'safe',
          command: 'ttr storage prune --category xcode-derived-data --apply',
          apply: 'auto',
        },
      ],
    });
    expect(result).toMatchObject({ pressure: 'critical', refuse: true });
    expect(result.message).toContain('Remove DerivedData');
    expect(result.message).not.toContain('Empty Trash');
    expect(result.message).toContain('--ignore-disk');
  });

  it('refuses UNKNOWN headroom unless the operator overrides explicitly', async () => {
    expect(
      (
        await diskAdmission({
          cwd: '/w',
          env: { ...(await isolated()), TTR_RESOURCES_IGNORE_DISK: '1' },
          probe: probe(1),
          reclaim,
        })
      ).refuse
    ).toBe(false);
    const failing = async () => {
      throw new Error('statfs unsupported');
    };
    const unknown = await diskAdmission({
      cwd: '/w',
      env: await isolated(),
      probe: failing,
      reclaim,
    });
    expect(unknown).toMatchObject({ pressure: 'unknown', refuse: true });
    expect(unknown.message).toContain('UNKNOWN');
    expect(unknown.message).toContain('statfs unsupported');
    expect(unknown.message).toContain('--ignore-disk');
    expect(
      (
        await diskAdmission({
          cwd: '/w',
          env: { ...(await isolated()), TTR_RESOURCES_IGNORE_DISK: '1' },
          probe: failing,
          reclaim,
        })
      ).refuse
    ).toBe(false);
  });

  it('uses configured thresholds', async () => {
    const result = await diskAdmission({
      cwd: '/w',
      env: { ...(await isolated()), TTR_STORAGE_MIN_FREE: '250G' },
      probe: probe(200),
      reclaim,
      holds,
      suggestions: async () => null,
    });
    expect(result.refuse).toBe(true);
  });
});
