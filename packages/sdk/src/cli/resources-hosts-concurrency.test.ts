import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import type { HostRegistry } from './resources-hosts-config';
import { type HostDispatchDeps, hostsRun } from './resources-hosts-dispatch';
import { hostLedger, remoteDispatchBlocker } from './resources-hosts-ledger';
import type { Reservation } from './resources-hosts-plan';
import type { HostProbe } from './resources-hosts-probe';

const registry: HostRegistry = {
  version: 1,
  hubHostname: hostname(),
  fairness: { maxBypass: 4 },
  telemetryTtlSeconds: 120,
  hosts: [
    {
      id: 'sonha',
      kind: 'runner',
      runnerId: 'sonha',
      platform: 'darwin',
      preference: 1,
      capacity: { cpus: 8, memoryGiB: 64 },
      reserved: { cpus: 0, memoryGiB: 0, diskGiB: 50 },
      slots: { heavy: 2, light: 1 },
      workers: { heavy: 1, light: 1 },
      weights: {
        heavy: { cpus: 1, memoryGiB: 1 },
        light: { cpus: 1, memoryGiB: 1 },
      },
    },
    {
      id: 'm4',
      kind: 'local',
      platform: process.platform === 'darwin' ? 'darwin' : 'linux',
      preference: 4,
      capacity: { cpus: 8, memoryGiB: 64 },
      reserved: { cpus: 0, memoryGiB: 0, diskGiB: 50 },
      slots: { heavy: 2, light: 2 },
      workers: { heavy: 1, light: 1 },
      weights: {
        heavy: { cpus: 1, memoryGiB: 1 },
        light: { cpus: 1, memoryGiB: 1 },
      },
    },
  ],
};
const fleet = async (): Promise<DevboxFleetSnapshot> => ({
  server_time: new Date().toISOString(),
  runs: [],
  leases: [],
  runners: [
    {
      id: 'sonha',
      name: 'sonha',
      status: 'online',
      last_heartbeat_at: new Date().toISOString(),
      heartbeat_enabled: true,
      enabled_features: { run: true },
      resource_limits: null,
      capabilities: {
        executionMode: 'trusted',
        protocols: { commitRun: [1] },
        os: { platform: 'darwin' },
        disk: { freeGiB: 100 },
        resources: { loadAverage: [0], cpu: { cores: 8 } },
      },
      activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
    },
  ],
});
const probes = (occupied = 1): Record<string, HostProbe> => ({
  sonha: {
    healthy: true,
    sample: {
      platform: 'darwin',
      occupied,
      waiting: 0,
      effectiveLanes: 2,
      diskFreeGiB: 100,
      loadPerCpu: 0.1,
    },
  },
});
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))
  );
});
const home = async () => {
  const path = await mkdtemp(join(tmpdir(), 'ttr-concurrent-'));
  homes.push(path);
  return path;
};
const deps = (): HostDispatchDeps => ({
  fleet,
  probeHosts: async () => probes(),
  commitPlan: async () => ({ sha: 'a'.repeat(40), prefix: '' }),
  localDiskFreeGiB: async () => 100,
  localDiskGate: async () => ({ admit: true, freeGiB: 100 }),
  runLocal: async () => 0,
  runRemote: async () => 0,
  pollMs: 1,
  log: () => {},
});
const run = (
  path: string,
  dependencies: HostDispatchDeps,
  jobClass: 'light' | 'heavy' = 'heavy'
) =>
  hostsRun({
    home: path,
    command: 'bun',
    args: ['test'],
    registry,
    deps: dependencies,
    jobClass,
    auto: true,
  });
describe('review: remote lane custody', () => {
  it('P1: two concurrent runs cannot both take the last unconfirmed remote lane', async () => {
    const path = await home();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const selected: string[] = [];
    const dependencies = deps();
    dependencies.runRemote = async ({ host }) => {
      selected.push(host.id);
      if (selected.length === 1) {
        entered();
        await held;
      }
      return 0;
    };
    dependencies.runLocal = async ({ host }) => {
      selected.push(host.id);
      return 0;
    };
    const a = run(path, dependencies);
    try {
      await started;
      expect(await run(path, dependencies)).toBe(0);
      expect(selected).toEqual(['sonha', 'm4']);
    } finally {
      release();
      await a;
    }
    expect(await hostLedger(path)).toEqual({ tickets: [], reservations: [] });
  });
  it('P2: fleet-only hosts shares an idle two-lane runner after the first hub run starts', async () => {
    const path = await home();
    const dependencies = deps();
    let running = 0;
    dependencies.fleet = async () => {
      const snapshot = await fleet();
      return {
        ...snapshot,
        runners: snapshot.runners.map((runner) => ({
          ...runner,
          activity: { running_runs: running, queued_runs: 0, active_leases: 0 },
        })),
      };
    };
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const selected: string[] = [];
    dependencies.runRemote = async ({ host }) => {
      selected.push(host.id);
      if (selected.length === 1) {
        running = 1;
        entered();
        await held;
      }
      return 0;
    };
    dependencies.runLocal = async ({ host }) => {
      selected.push(host.id);
      return 0;
    };
    const invoke = () =>
      hostsRun({
        home: path,
        command: 'bun',
        args: ['test'],
        registry,
        deps: dependencies,
        jobClass: 'heavy',
        auto: false,
      });
    const a = invoke();
    try {
      await started;
      expect(running).toBe(1);
      expect(await invoke()).toBe(0);
      expect(selected).toEqual(['sonha', 'sonha']);
    } finally {
      release();
      await a;
    }
    expect(await hostLedger(path)).toEqual({ tickets: [], reservations: [] });
  });
  it('control: the dynamic probe includes the first started job and conservatively charges its reservation', async () => {
    const path = await home();
    const dependencies = deps();
    let running = 0;
    dependencies.fleet = async () => {
      const snapshot = await fleet();
      return {
        ...snapshot,
        runners: snapshot.runners.map((runner) => ({
          ...runner,
          activity: { running_runs: running, queued_runs: 0, active_leases: 0 },
        })),
      };
    };
    const observed: number[] = [];
    dependencies.probeHosts = async () => {
      observed.push(running);
      return probes(running);
    };
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const selected: string[] = [];
    dependencies.runRemote = async ({ host }) => {
      selected.push(host.id);
      running = 1;
      entered();
      await held;
      return 0;
    };
    dependencies.runLocal = async ({ host }) => {
      selected.push(host.id);
      return 0;
    };
    const a = run(path, dependencies);
    try {
      await started;
      expect(await run(path, dependencies)).toBe(0);
      expect(selected).toEqual(['sonha', 'm4']);
      expect(observed).toContain(0);
      expect(observed).toContain(1);
    } finally {
      release();
      await a;
    }
    expect(await hostLedger(path)).toEqual({ tickets: [], reservations: [] });
  });
  it('P1: dispatch recheck counts other in-flight reservations but excludes its own', async () => {
    const reservation = (token: string): Reservation => ({
      token,
      hostId: 'sonha',
      jobClass: 'heavy',
      project: 'sdk',
      scope: 'host',
    });
    const a = reservation(randomUUID());
    const b = reservation(randomUUID());
    expect(
      remoteDispatchBlocker(registry, 'sonha', await fleet(), [], probes(), {
        jobClass: 'heavy',
        reservations: [a],
        token: a.token,
      })
    ).toBeUndefined();
    expect(
      remoteDispatchBlocker(registry, 'sonha', await fleet(), [], probes(), {
        jobClass: 'heavy',
        reservations: [a, b],
        token: a.token,
      })
    ).toMatch(/full|lane|budget/u);
  });
  it('P2: light jobs use the same remote physical lane check during planning and dispatch', async () => {
    const path = await home();
    const dependencies = deps();
    dependencies.probeHosts = async () => probes(2);
    const local = vi.fn(async () => 0);
    const remote = vi.fn(async () => 0);
    dependencies.runLocal = local;
    dependencies.runRemote = remote;
    expect(await run(path, dependencies, 'light')).toBe(0);
    expect(local).toHaveBeenCalledOnce();
    expect(remote).not.toHaveBeenCalled();
  });
  it('control: a probe failure while waiting excludes that host and takes a free fallback', async () => {
    const path = await home();
    const dependencies = deps();
    let count = 0;
    dependencies.probeHosts = async () =>
      ++count === 1
        ? probes(2)
        : {
            sonha: { healthy: false, reason: 'SSH probe failed while waiting' },
          };
    dependencies.localDiskFreeGiB = async () => (count === 1 ? 49 : 100);
    const local = vi.fn(async () => 0);
    const remote = vi.fn(async () => 0);
    dependencies.runLocal = local;
    dependencies.runRemote = remote;
    expect(await run(path, dependencies)).toBe(0);
    expect(local).toHaveBeenCalledOnce();
    expect(remote).not.toHaveBeenCalled();
    expect(count).toBe(2);
    expect(await hostLedger(path)).toEqual({ tickets: [], reservations: [] });
  });
});
