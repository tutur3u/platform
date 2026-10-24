import { describe, expect, it } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import {
  type HostRegistry,
  proposedHostRegistry,
} from './resources-hosts-config';
import { hostStates } from './resources-hosts-ledger';
import {
  canEverHold,
  type HostState,
  planAdmissions,
  type Reservation,
  type Waiter,
} from './resources-hosts-plan';
import { simulateHosts } from './resources-hosts-sim';

const registry = proposedHostRegistry('runner-linux');
const healthy = (): Record<string, HostState> => ({
  m4: { healthy: true, diskFreeGiB: 100 },
  'skr-linux-lan': { healthy: true, diskFreeGiB: 400 },
});
const waiter = (
  token: string,
  jobClass: 'light' | 'heavy',
  project = 'tuturuuu',
  queuedAt = Number(token.replace(/\D/gu, '')) || 0
): Waiter => ({
  token,
  jobClass,
  project,
  queuedAt,
  bypassed: 0,
  remoteOk: true,
});
const count = (plan: ReturnType<typeof planAdmissions>, hostId: string) =>
  plan.assignments.filter((entry) => entry.hostId === hostId).length;

describe('per-host ceilings', () => {
  it('never exceeds class slots or weighted budgets on any host', () => {
    const waiters = Array.from({ length: 12 }, (_, i) =>
      waiter(`w${i}`, i % 3 ? 'heavy' : 'light')
    );
    const plan = planAdmissions(registry, healthy(), [], waiters);
    for (const host of registry.hosts) {
      const assigned = plan.assignments.filter(
        (entry) => entry.hostId === host.id
      );
      for (const jobClass of ['light', 'heavy'] as const) {
        const n = assigned.filter((entry) =>
          waiters.some(
            (w) => w.token === entry.token && w.jobClass === jobClass
          )
        ).length;
        expect(n, `${host.id} ${jobClass}`).toBeLessThanOrEqual(
          host.slots[jobClass]
        );
      }
      const cpus = assigned.reduce((total, entry) => {
        const jobClass = waiters.find((w) => w.token === entry.token)!.jobClass;
        return total + host.weights[jobClass].cpus;
      }, 0);
      expect(cpus).toBeLessThanOrEqual(host.capacity.cpus - host.reserved.cpus);
    }
    // Both hosts admit at once: disjoint jobs run concurrently.
    expect(count(plan, 'm4')).toBeGreaterThan(0);
    expect(count(plan, 'skr-linux-lan')).toBeGreaterThan(0);
  });

  it('counts external work and refuses a weight that no longer fits', () => {
    const states = healthy();
    states['skr-linux-lan']!.external = { heavy: 2 };
    states.m4!.external = { heavy: 2 };
    const plan = planAdmissions(registry, states, [], [waiter('w1', 'heavy')]);
    expect(plan.assignments).toEqual([]);
    expect(plan.blocked.w1).toMatch(/heavy slots full/u);
    const tight: HostRegistry = {
      ...registry,
      hosts: [
        {
          ...registry.hosts[0]!,
          slots: { light: 4, heavy: 4 },
        },
      ],
    };
    const budget = planAdmissions(
      tight,
      healthy(),
      [],
      [1, 2, 3, 4].map((i) => waiter(`w${i}`, 'heavy'))
    );
    // 6 usable CPUs / 2 per heavy job = 3 jobs, although 4 slots exist.
    expect(budget.assignments).toHaveLength(3);
    expect(budget.blocked.w4).toMatch(/CPU budget/u);
  });

  it('keeps local heavy behind lane FIFO waiters', () => {
    const states = healthy();
    states.m4!.laneWaiters = 3;
    states['skr-linux-lan']!.healthy = false;
    const plan = planAdmissions(registry, states, [], [waiter('w1', 'heavy')]);
    expect(plan.assignments).toEqual([]);
    expect(plan.blocked.w1).toMatch(/lane waiter/u);
  });
});

describe('stale, unreachable and unknown hosts are not admitted', () => {
  const now = Date.parse('2026-10-23T05:00:00Z');
  const runner = (heartbeatAgeMs: number, extra: object = {}) =>
    ({
      id: 'runner-linux',
      name: 'skr-linux-lan',
      status: 'online',
      last_heartbeat_at: new Date(now - heartbeatAgeMs).toISOString(),
      heartbeat_enabled: true,
      enabled_features: { run: true },
      resource_limits: null,
      capabilities: {
        executionMode: 'trusted',
        protocols: { commitRun: [1] },
        disk: { freeGiB: 400 },
        resources: { loadAverage: [4, 4, 4], cpu: { cores: 20 } },
      },
      drain_requested_at: null,
      activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
      ...extra,
    }) as DevboxFleetSnapshot['runners'][number];
  const snapshot = (runners: DevboxFleetSnapshot['runners']) =>
    ({ runners, runs: [], leases: [] }) as DevboxFleetSnapshot;
  const remoteState = (telemetry: Parameters<typeof hostStates>[1]) =>
    hostStates(
      registry,
      { localDiskFreeGiB: 100, now, ...telemetry },
      {
        owners: 2,
        waiters: 0,
      },
      []
    )['skr-linux-lan']!;

  it('admits a fresh trusted runner with known disk', () => {
    expect(remoteState({ snapshot: snapshot([runner(5_000)]) })).toMatchObject({
      healthy: true,
      diskFreeGiB: 400,
    });
  });

  it.each([
    ['stale heartbeat', { snapshot: snapshot([runner(10 * 60_000)]) }],
    ['unreachable fleet', { snapshot: undefined }],
    ['runner missing from the fleet', { snapshot: snapshot([]) }],
    [
      'draining runner',
      {
        snapshot: snapshot([
          runner(5_000, { drain_requested_at: new Date(now).toISOString() }),
        ]),
      },
    ],
  ])('refuses a %s', (_, telemetry) => {
    const state = remoteState(telemetry);
    expect(state.healthy).toBe(false);
    const states = { ...healthy(), 'skr-linux-lan': state };
    states.m4!.external = { heavy: 2 };
    const plan = planAdmissions(registry, states, [], [waiter('w1', 'heavy')]);
    expect(plan.assignments).toEqual([]);
  });

  it('refuses a runner without the commit-run protocol even with healthy disk', () => {
    const state = remoteState({
      snapshot: snapshot([
        runner(5_000, {
          capabilities: {
            executionMode: 'trusted',
            protocols: { commitRun: [] },
            disk: { freeGiB: 400 },
          },
        }),
      ]),
    });
    expect(state.healthy).toBe(false);
    expect(state.reason).toMatch(/commit-run protocol/u);
  });

  it('refuses a runner that reports no activity telemetry (REV-6503-8)', () => {
    const state = remoteState({
      snapshot: snapshot([runner(5_000, { activity: null })]),
    });
    expect(state).toMatchObject({
      healthy: false,
      reason: 'runner reports no activity telemetry',
    });
  });

  it('fails closed on unknown or low disk, local or remote', () => {
    const unknownRemote = remoteState({
      snapshot: snapshot([
        runner(5_000, {
          capabilities: {
            executionMode: 'trusted',
            protocols: { commitRun: [1] },
            resources: { loadAverage: [4, 4, 4], cpu: { cores: 20 } },
          },
        }),
      ]),
    });
    expect(unknownRemote.healthy).toBe(true);
    expect(unknownRemote.diskFreeGiB).toBeUndefined();
    const states: Record<string, HostState> = {
      m4: { healthy: true, diskFreeGiB: undefined },
      'skr-linux-lan': unknownRemote,
    };
    const plan = planAdmissions(
      registry,
      states,
      [],
      [waiter('w1', 'light'), waiter('w2', 'heavy')]
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.blocked.w1).toMatch(/free disk is unknown/u);
    states.m4!.diskFreeGiB = 10;
    const low = planAdmissions(registry, states, [], [waiter('w1', 'light')]);
    expect(low.blocked.w1).toMatch(/below the 15 GiB floor/u);
  });

  it('keeps dirty or unpushed trees off remote runners', () => {
    const states = healthy();
    states.m4!.external = { heavy: 2 };
    const plan = planAdmissions(
      registry,
      states,
      [],
      [{ ...waiter('w1', 'heavy'), remoteOk: false }]
    );
    expect(plan.assignments).toEqual([]);
    expect(plan.blocked.w1).toMatch(/clean, pushed commit/u);
  });
});

describe('project-only locks never claim host-wide admission', () => {
  it('ignores project-scoped reservations for capacity and admission', () => {
    const lock: Reservation = {
      token: 'lock',
      hostId: 'm4',
      jobClass: 'heavy',
      project: 'upskii',
      scope: 'project',
    };
    const states = healthy();
    states['skr-linux-lan']!.healthy = false;
    // Two project locks would fill M4's heavy slots if they counted.
    const plan = planAdmissions(
      registry,
      states,
      [lock, { ...lock, token: 'lock2' }],
      [waiter('w1', 'heavy', 'upskii')]
    );
    expect(plan.assignments).toEqual([{ token: 'w1', hostId: 'm4' }]);
    // Holding only a project lock is not admission: the holder still queues.
    const holder = planAdmissions(registry, states, [lock], []);
    expect(holder.assignments).toEqual([]);
  });
});

describe('starving waiters hold only hosts they could use (REV-6503-9)', () => {
  it('does not hold a runner for a waiter that cannot run remotely', () => {
    const states = healthy();
    states.m4!.external = { heavy: 2 };
    const plan = planAdmissions(
      registry,
      states,
      [],
      [
        { ...waiter('w1', 'heavy'), remoteOk: false, bypassed: 99 },
        waiter('w2', 'heavy'),
      ]
    );
    expect(plan.assignments).toEqual([
      { token: 'w2', hostId: 'skr-linux-lan' },
    ]);
    expect(canEverHold(registry, { jobClass: 'heavy', remoteOk: false })).toBe(
      true
    );
    const remoteOnly: HostRegistry = {
      ...registry,
      hosts: [
        { ...registry.hosts[0]!, slots: { light: 0, heavy: 0 } },
        registry.hosts[1]!,
      ],
    };
    expect(
      canEverHold(remoteOnly, { jobClass: 'heavy', remoteOk: false })
    ).toBe(false);
  });
});

describe('fairness across projects and no starvation', () => {
  it('admits a younger project ahead of a backlog from one project', () => {
    const one: HostRegistry = {
      ...registry,
      hosts: [{ ...registry.hosts[0]!, slots: { light: 0, heavy: 1 } }],
    };
    const reservations: Reservation[] = [];
    const waiters = [
      waiter('u1', 'heavy', 'upskii', 1),
      waiter('u2', 'heavy', 'upskii', 2),
      waiter('u3', 'heavy', 'upskii', 3),
      waiter('t4', 'heavy', 'tuturuuu', 4),
    ];
    const order: string[] = [];
    let live = [...waiters];
    while (live.length) {
      const plan = planAdmissions(one, healthy(), reservations, live);
      const [next] = plan.assignments;
      order.push(next!.token);
      live = live.filter((entry) => entry.token !== next!.token);
      // The admitted job is now the only live one (the previous finished),
      // so its project carries the live share for the next round.
      reservations.splice(0, reservations.length, {
        token: next!.token,
        hostId: 'elsewhere',
        jobClass: 'heavy',
        project: waiters.find((w) => w.token === next!.token)!.project,
        scope: 'host',
      });
    }
    // After u1, Tuturuuu's single job goes before Upskii's backlog.
    expect(order).toEqual(['u1', 't4', 'u2', 'u3']);
  });

  it('bounds how often a heavy waiter is overtaken by light work', () => {
    const local: HostRegistry = {
      ...registry,
      fairness: { maxBypass: 2 },
      hosts: [
        {
          ...registry.hosts[0]!,
          capacity: { cpus: 7, memoryGiB: 24 },
          reserved: { cpus: 4, memoryGiB: 8, diskGiB: 15 },
          slots: { light: 3, heavy: 1 },
          weights: {
            light: { cpus: 1, memoryGiB: 1 },
            heavy: { cpus: 3, memoryGiB: 4 },
          },
        },
      ],
    };
    // A steady stream of light jobs always keeps one running, so the heavy
    // job (needing the whole 3-CPU budget) only fits if admission holds.
    const lights = Array.from({ length: 40 }, (_, i) => ({
      id: `l${String(i).padStart(2, '0')}`,
      project: 'upskii',
      jobClass: 'light' as const,
      arrival: i * 30,
      duration: 90,
    }));
    const heavy = {
      id: 'h',
      project: 'tuturuuu',
      jobClass: 'heavy' as const,
      arrival: 5,
      duration: 300,
    };
    const fair = simulateHosts(local, [...lights, heavy]);
    const run = fair.runs.find((entry) => entry.id === 'h');
    expect(run).toBeDefined();
    expect(run!.wait).toBeLessThanOrEqual(5 * 90);
    expect(fair.unfinished).toEqual([]);
    // Without the bound the same stream starves it until the stream ends.
    const unbounded = simulateHosts({ ...local, fairness: { maxBypass: 64 } }, [
      ...lights,
      heavy,
    ]);
    expect(
      unbounded.runs.find((entry) => entry.id === 'h')!.wait
    ).toBeGreaterThan(30 * 30);
  });
});
