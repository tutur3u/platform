import {
  advanceRun,
  type BalancerRun,
  parseRunRequest,
  runsForRequest,
} from '@tuturuuu/devbox';
import { describe, expect, it } from 'vitest';
import { planBalancerRuns } from './balancer-placement';
import { fixtureHost, fixtureTelemetry } from './balancer-test-fixtures';

const now = Date.parse('2026-10-25T05:00:00.000Z');
const sha = 'b89f52321ec9bbc26e63c8978320d7e111e74c31';
const requestRuns = (
  requestId: string,
  patch: Record<string, unknown> = {},
  at = '2026-10-25T04:59:00.000Z'
) =>
  runsForRequest(
    parseRunRequest({
      requestId,
      source: { repo: 'tutur3u/platform', baseSha: sha },
      command: ['bun', 'x', 'vitest', 'run'],
      replicas: 2,
      ...patch,
    }),
    'source',
    at
  );
const linux = fixtureHost('linux', { preference: 1 });
const thanh = fixtureHost('thanh', {
  platform: 'darwin',
  arch: 'arm64',
  preference: 2,
});
const m4 = fixtureHost('m4', {
  platform: 'darwin',
  arch: 'arm64',
  preference: 9,
});
const hosts = [linux, thanh, m4];
const fresh = () => ({
  linux: fixtureTelemetry(linux, now),
  thanh: fixtureTelemetry(thanh, now),
  m4: fixtureTelemetry(m4, now),
});

describe('balancer placement', () => {
  it('spreads replicas across distinct hosts in preference order', () => {
    const plan = planBalancerRuns(
      hosts,
      fresh(),
      requestRuns('proof-two-hosts-0001'),
      now
    );
    expect(plan.placements).toEqual([
      { runId: 'proof-two-hosts-0001-r1', deviceId: 'linux' },
      { runId: 'proof-two-hosts-0001-r2', deviceId: 'thanh' },
    ]);
  });

  it('never places on stale or missing telemetry; the host is UNKNOWN', () => {
    const telemetry = {
      ...fresh(),
      linux: fixtureTelemetry(linux, now, {
        receivedAt: new Date(now - 120_000).toISOString(),
      }),
      thanh: undefined,
    };
    const plan = planBalancerRuns(
      hosts,
      telemetry,
      requestRuns('proof-stale-host-01'),
      now
    );
    expect(plan.verdicts.linux!.status).toBe('unknown');
    expect(plan.verdicts.thanh!.status).toBe('unknown');
    expect(plan.placements).toEqual([
      { runId: 'proof-stale-host-01-r1', deviceId: 'm4' },
    ]);
    expect(plan.blocked['proof-stale-host-01-r2']).toMatch(
      /already runs another replica/
    );
    expect(plan.blocked['proof-stale-host-01-r2']).toMatch(/linux: unknown/);
  });

  it('counts every consumer of the host queue, not just balancer runs', () => {
    const telemetry = {
      ...fresh(),
      linux: fixtureTelemetry(linux, now, {
        queue: { enabled: true, lanes: 2, occupied: 2, waiting: 1 },
      }),
    };
    const plan = planBalancerRuns(
      hosts,
      telemetry,
      requestRuns('proof-busy-linux-01'),
      now
    );
    expect(plan.placements.map((entry) => entry.deviceId)).toEqual([
      'thanh',
      'm4',
    ]);
  });

  it('keeps in-flight dispatches reserved until the host record shows them', () => {
    const [first] = requestRuns('proof-inflight-0001', { replicas: 1 });
    const placed = advanceRun(
      first!,
      'placed',
      '2026-10-25T04:59:30.000Z',
      'placed',
      {
        deviceId: 'linux',
      }
    );
    const busy = requestRuns('proof-inflight-0002', { replicas: 1 });
    const telemetry = {
      linux: fixtureTelemetry(linux, now, {
        queue: { enabled: true, lanes: 2, occupied: 1, waiting: 0 },
      }),
    };
    const plan = planBalancerRuns([linux], telemetry, [placed, ...busy], now);
    expect(plan.placements).toEqual([]);
    expect(plan.blocked['proof-inflight-0002-r1']).toMatch(/slots full/);
  });

  it('places higher priority first when capacity is scarce', () => {
    const low = requestRuns(
      'proof-priority-low-01',
      { replicas: 1, priority: 1 },
      '2026-10-25T04:00:00.000Z'
    );
    const high = requestRuns('proof-priority-high-1', {
      replicas: 1,
      priority: 9,
    });
    const telemetry = {
      linux: fixtureTelemetry(linux, now, {
        queue: { enabled: true, lanes: 1, occupied: 0, waiting: 0 },
      }),
    };
    const plan = planBalancerRuns([linux], telemetry, [...low, ...high], now);
    expect(plan.placements).toEqual([
      { runId: 'proof-priority-high-1-r1', deviceId: 'linux' },
    ]);
    expect(plan.blocked['proof-priority-low-01-r1']).toMatch(/slots full/);
  });

  it('skips held hosts and honours platform constraints', () => {
    const plan = planBalancerRuns(
      [linux, { ...thanh, hold: 'maintenance' }, m4],
      fresh(),
      requestRuns('proof-constraints-01', {
        replicas: 1,
        constraints: { os: ['darwin'] },
      }),
      now
    );
    expect(plan.verdicts.thanh).toEqual({
      status: 'held',
      reason: 'maintenance',
    });
    expect(plan.placements).toEqual([
      { runId: 'proof-constraints-01-r1', deviceId: 'm4' },
    ]);
  });

  it('leaves cancelled-before-placement and terminal runs alone', () => {
    const runs: BalancerRun[] = requestRuns('proof-cancelled-0001', {
      replicas: 1,
    }).map((run) => ({
      ...run,
      cancelRequestedAt: '2026-10-25T04:59:59.000Z',
    }));
    expect(planBalancerRuns(hosts, fresh(), runs, now).placements).toEqual([]);
  });
});
