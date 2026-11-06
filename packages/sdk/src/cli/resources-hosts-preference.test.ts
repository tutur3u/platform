import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { runHostsAction } from './resources-hosts-cli';
import type { HostRegistry } from './resources-hosts-config';
import {
  hostStates,
  remoteDispatchBlocker,
  runnerLoadPerCpu,
} from './resources-hosts-ledger';
import {
  type HostState,
  planAdmissions,
  type Waiter,
} from './resources-hosts-plan';
import { preferenceRegistry, preferenceScenarios } from './resources-hosts-sim';

const registry = preferenceRegistry();
const ok = (): HostState => ({ healthy: true, diskFreeGiB: 400 });
const states = (overrides: Record<string, HostState> = {}) => ({
  m4: ok(),
  'skr-linux-lan': ok(),
  'skr-studio': ok(),
  'skr-sonha': ok(),
  ...overrides,
});
const heavy = (token = 'w1', remoteOk = true): Waiter => ({
  token,
  jobClass: 'heavy',
  project: 'tuturuuu',
  queuedAt: 1,
  bypassed: 0,
  remoteOk,
});
const placed = (s: Record<string, HostState>, waiter = heavy()) =>
  planAdmissions(registry, s, [], [waiter]).assignments[0]?.hostId;

describe('operator host preference', () => {
  it('orders eligible hosts studio > sonha > linux > m4', () => {
    expect(placed(states())).toBe('skr-studio');
    expect(
      placed(states({ 'skr-studio': { healthy: false, reason: 'offline' } }))
    ).toBe('skr-sonha');
    const order = planAdmissions(
      registry,
      states(),
      [],
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => heavy(`w${i}`))
    ).assignments.map((entry) => entry.hostId);
    // Two heavy slots per host, filled in preference order.
    expect(order).toEqual([
      'skr-studio',
      'skr-studio',
      'skr-sonha',
      'skr-sonha',
      'skr-linux-lan',
      'skr-linux-lan',
      'm4',
      'm4',
    ]);
  });

  it.each([
    ['degraded', { healthy: false, reason: 'runner is degraded' }],
    ['stale', { healthy: false, reason: 'runner telemetry is stale' }],
    ['unknown disk', { healthy: true, diskFreeGiB: undefined }],
    ['low disk', { healthy: true, diskFreeGiB: 10 }],
    ['full', { healthy: true, diskFreeGiB: 400, external: { heavy: 2 } }],
  ] as const)('skips a %s preferred host instead of forcing it', (_, state) => {
    const today = states({
      'skr-studio': { healthy: false, reason: 'offline' },
      'skr-sonha': state as HostState,
    });
    expect(placed(today)).toBe('skr-linux-lan');
  });

  it('never forces a job onto an ineligible preferred host', () => {
    const only: HostRegistry = {
      ...registry,
      hosts: registry.hosts.filter((host) => host.id === 'skr-sonha'),
    };
    const plan = planAdmissions(
      only,
      { 'skr-sonha': { healthy: false, reason: 'runner is degraded' } },
      [],
      [heavy()]
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.blocked.w1).toMatch(/degraded/u);
  });

  it('does not override remote eligibility for dirty trees', () => {
    expect(placed(states(), heavy('w1', false))).toBe('m4');
  });

  it('falls back to the capacity score between unranked hosts', () => {
    const unranked: HostRegistry = {
      ...registry,
      hosts: registry.hosts
        .filter((host) => ['m4', 'skr-linux-lan'].includes(host.id))
        .map(({ preference: _, ...host }) => host),
    };
    // Linux has more CPU left after placement than the M4.
    expect(
      planAdmissions(unranked, states(), [], [heavy()]).assignments[0]?.hostId
    ).toBe('skr-linux-lan');
  });
});

describe('degraded runners (load per CPU)', () => {
  const now = Date.parse('2026-10-23T06:30:00Z');
  const sonha = (load: number, cores = 24, extra: object = {}) =>
    ({
      runners: [
        {
          id: 'skr-sonha',
          name: 'skr-sonha',
          status: 'online',
          last_heartbeat_at: new Date(now - 5_000).toISOString(),
          heartbeat_enabled: true,
          enabled_features: { run: true },
          resource_limits: null,
          capabilities: {
            executionMode: 'trusted',
            protocols: { commitRun: [1] },
            resources: {
              loadAverage: [load, load, load],
              cpu: { cores },
              disk: { freeGiB: 400, freePct: 85 },
            },
            ...extra,
          },
          drain_requested_at: null,
          activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
        },
      ],
      runs: [],
      leases: [],
      server_time: new Date(now).toISOString(),
    }) as unknown as DevboxFleetSnapshot;
  const state = (snapshot: DevboxFleetSnapshot, hosts = registry) =>
    hostStates(
      hosts,
      { snapshot, localDiskFreeGiB: 100, now },
      { owners: 0, waiters: 0 },
      []
    )['skr-sonha']!;

  it('marks the measured Sonha load (27 to 32) as degraded', () => {
    expect(state(sonha(30))).toMatchObject({
      healthy: false,
      reason: expect.stringMatching(
        /degraded \(load 1\.25 per CPU, ceiling 1\)/u
      ),
    });
    expect(state(sonha(8)).healthy).toBe(true);
  });

  it('respects a per-host load ceiling and fails closed without load telemetry', () => {
    const lenient: HostRegistry = {
      ...registry,
      hosts: registry.hosts.map((host) =>
        host.id === 'skr-sonha' ? { ...host, maxLoadPerCpu: 2 } : host
      ),
    };
    expect(state(sonha(30), lenient).healthy).toBe(true);
    expect(
      runnerLoadPerCpu({ executionMode: 'trusted' } as Record<string, unknown>)
    ).toBeUndefined();
    expect(state(sonha(8, 24, { resources: undefined }))).toMatchObject({
      healthy: false,
      reason: 'runner reports no load telemetry',
    });
  });

  it('revalidates load right before dispatch', () => {
    expect(
      remoteDispatchBlocker(registry, 'skr-sonha', sonha(8))
    ).toBeUndefined();
    expect(remoteDispatchBlocker(registry, 'skr-sonha', sonha(30))).toMatch(
      /degraded/u
    );
  });
});

describe('preference in the dry run', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  it('skips today’s unavailable preferred hosts and uses them when healthy', () => {
    const { order, today, allHealthy } = preferenceScenarios();
    expect(order).toEqual(['skr-studio', 'skr-sonha', 'skr-linux-lan', 'm4']);
    expect(today.unfinished).toEqual([]);
    expect(
      today.runs.some((run) => ['skr-studio', 'skr-sonha'].includes(run.hostId))
    ).toBe(false);
    expect(today.runs.map((run) => run.hostId)).toContain('skr-linux-lan');
    expect(allHealthy.unfinished).toEqual([]);
    expect(allHealthy.runs[0]?.hostId).toBe('skr-studio');
    for (const host of registry.hosts)
      for (const result of [today, allHealthy]) {
        expect(result.peak[host.id]!.heavy).toBeLessThanOrEqual(
          host.slots.heavy
        );
        expect(result.peak[host.id]!.light).toBeLessThanOrEqual(
          host.slots.light
        );
      }
  });

  it('prints the preference scenarios in ttr resources hosts --simulate', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-hosts-pref-'))
    );
    dirs.push(home);
    const out: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
      });
    try {
      await runHostsAction(home, ['--simulate']);
      await runHostsAction(home, ['--simulate', '--json']);
    } finally {
      write.mockRestore();
    }
    expect(out[0]).toContain(
      'preference order: skr-studio > skr-sonha > skr-linux-lan > m4'
    );
    expect(out[0]).toContain('skr-sonha degraded: skipped');
    const parsed = JSON.parse(out[1]!) as {
      preference: { order: string[]; today: { runs: { hostId: string }[] } };
    };
    expect(parsed.preference.order[0]).toBe('skr-studio');
  });
});
