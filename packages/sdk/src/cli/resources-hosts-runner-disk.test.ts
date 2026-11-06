import { describe, expect, it } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { proposedHostRegistry } from './resources-hosts-config';
import { hostStates, remoteDispatchBlocker } from './resources-hosts-ledger';
import { diskCapability, GiB } from './storage-headroom';

// Runner disk headroom must be read where agents publish it: the bucketed
// `capabilities.resources.disk` produced by the same encoder the heartbeat
// uses (devbox-agent-capabilities -> diskCapability).
const registry = proposedHostRegistry('runner-linux');
const now = Date.parse('2026-10-25T05:00:00Z');
const published = diskCapability({
  path: '/home/runner',
  device: 1,
  totalBytes: 900 * GiB,
  freeBytes: 398 * GiB,
  usedBytes: 502 * GiB,
  freePercent: (398 / 900) * 100,
  inodesTotal: 1_000_000,
  inodesFree: 900_000,
  inodeFreePercent: 90,
});
const snapshot = (capabilities: Record<string, unknown>) =>
  ({
    runners: [
      {
        id: 'runner-linux',
        name: 'skr-linux-lan',
        status: 'online',
        last_heartbeat_at: new Date(now - 5_000).toISOString(),
        heartbeat_enabled: true,
        enabled_features: { run: true },
        resource_limits: null,
        capabilities: {
          executionMode: 'trusted',
          protocols: { commitRun: [1] },
          ...capabilities,
        },
        drain_requested_at: null,
        activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
      },
    ],
    runs: [],
    leases: [],
    server_time: new Date(now).toISOString(),
  }) as unknown as DevboxFleetSnapshot;
const runner = (capabilities: Record<string, unknown>) =>
  hostStates(
    registry,
    { snapshot: snapshot(capabilities), localDiskFreeGiB: 100, now },
    { owners: 0, waiters: 0 },
    []
  )['skr-linux-lan']!;
const load = { loadAverage: [4, 4, 4], cpu: { cores: 20 } };

describe('--hosts runner disk headroom', () => {
  it('reads the agent heartbeat shape (capabilities.resources.disk)', () => {
    expect(published.freeGiB).toBeGreaterThan(
      registry.hosts[1]!.reserved.diskGiB
    );
    const state = runner({ resources: { ...load, disk: published } });
    expect(state).toMatchObject({
      healthy: true,
      diskFreeGiB: published.freeGiB,
    });
    expect(
      remoteDispatchBlocker(
        registry,
        'skr-linux-lan',
        snapshot({ resources: { ...load, disk: published } })
      )
    ).toBeUndefined();
  });

  it.each([
    [
      'a top-level disk (not the agent field)',
      { resources: load, disk: published },
    ],
    ['no disk telemetry', { resources: load }],
    [
      'a malformed disk',
      { resources: { ...load, disk: { freeGiB: 1.5, freePct: 3 } } },
    ],
  ])('treats %s as unknown and fails closed', (_, capabilities) => {
    expect(runner(capabilities).diskFreeGiB).toBeUndefined();
    expect(
      remoteDispatchBlocker(registry, 'skr-linux-lan', snapshot(capabilities))
    ).toMatch(/disk is unknown/u);
  });
});
