import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { decodeCommitRun } from './devbox-commit-run';
import { commitRunCommand } from './resources-box-offload';
import { diskGate } from './resources-disk-gate';
import { autoQueueTarget } from './resources-hosts-auto';
import { type HostDispatchDeps, hostsRun } from './resources-hosts-dispatch';
import { hostLedger } from './resources-hosts-ledger';
import {
  type HostState,
  planAdmissions,
  type Waiter,
} from './resources-hosts-plan';
import { preferenceRegistry } from './resources-hosts-sim';

const runtime = vi.hoisted(() => {
  const state: { platform: 'darwin' | 'linux' } = { platform: 'darwin' };
  return state;
});
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  platform: () => runtime.platform,
}));

const registry = {
  ...preferenceRegistry(),
  hubHostname: hostname(),
  hosts: preferenceRegistry().hosts.map((host) => ({
    ...host,
    get platform() {
      return host.kind === 'local'
        ? runtime.platform
        : host.id === 'skr-linux-lan'
          ? ('linux' as const)
          : ('darwin' as const);
    },
    capabilities:
      host.id === 'skr-linux-lan'
        ? ['web' as const]
        : ['web' as const, 'ios' as const],
  })),
};
const job: Waiter = {
  token: 'one',
  project: 'sdk',
  jobClass: 'heavy',
  queuedAt: 1,
  bypassed: 0,
  remoteOk: true,
  placement: 'auto',
};
const ok = (platform = 'darwin'): HostState => ({
  healthy: true,
  diskFreeGiB: 400,
  loadPerCpu: 0.2,
  platform,
});
const states = (): Record<string, HostState> =>
  Object.fromEntries(
    registry.hosts.map((host) => [host.id, ok(host.platform)])
  );
const plan = (state = states(), waiter = job) =>
  planAdmissions(registry, state, [], [waiter]);
const chosen = (state = states(), waiter = job) =>
  plan(state, waiter).assignments[0]?.hostId;
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe.each(['darwin', 'linux'] as const)(
  'automatic placement on %s',
  (platform) => {
    beforeEach(() => {
      runtime.platform = platform;
    });
    it('never queues on a full Thanh while Sonha has a free lane', () => {
      const state = states();
      state['skr-studio']!.external = { heavy: 2 };
      state['skr-sonha']!.loadPerCpu = 0.6;
      expect(chosen(state)).toBe('skr-sonha');
    });
    it('honors free-lane host order before load and disk tie breakers', () => {
      const state = states();
      state['skr-studio']!.loadPerCpu = 0.4;
      state['skr-sonha']!.loadPerCpu = 0;
      expect(chosen(state)).toBe('skr-studio');
    });
    it('queues only when all eligible hosts are full, choosing the shortest estimate', () => {
      const state = states();
      expect(autoQueueTarget(registry, state, [], job)).toEqual({
        free: true,
        target: undefined,
      });
      for (const host of registry.hosts)
        state[host.id]!.external = { heavy: 2 };
      state['skr-studio']!.queuedJobs = 22;
      state['skr-studio']!.external = { heavy: 24 };
      state['skr-sonha']!.external = { heavy: 4 };
      const timed = {
        ...registry,
        hosts: registry.hosts.map((host) => ({
          ...host,
          expectedJobSeconds: host.id === 'skr-sonha' ? 10 : 60,
        })),
      };
      expect(plan(state).assignments).toEqual([]);
      expect(autoQueueTarget(timed, state, [], job).target).toEqual({
        hostId: 'skr-sonha',
        expectedWaitSeconds: 20,
      });
      state['skr-sonha']!.external = { heavy: 1 };
      expect(chosen(state)).toBe('skr-sonha');
    });
    it('does not queue on an unreachable host', () => {
      const state = states();
      state['skr-studio'] = {
        healthy: false,
        reason: 'probe failed: SSH connection refused',
      };
      expect(chosen(state)).toBe('skr-sonha');
      for (const host of registry.hosts)
        if (host.id !== 'skr-studio') state[host.id]!.external = { heavy: 2 };
      expect(autoQueueTarget(registry, state, [], job).target?.hostId).not.toBe(
        'skr-studio'
      );
      expect(plan(state).blocked.one).toContain('SSH connection refused');
    });
    it('protects pktm even when Linux has less load than a Studio', () => {
      const state = states();
      state['skr-linux-lan']!.loadPerCpu = 0;
      expect(chosen(state)).toBe('skr-studio');
      state['skr-studio']!.external = { heavy: 2 };
      state['skr-sonha']!.external = { heavy: 2 };
      expect(chosen(state)).toBe('skr-linux-lan');
      state['skr-linux-lan']!.external = { heavy: 2 };
      expect(chosen(state)).toBe('m4');
      state.m4!.external = { heavy: 2 };
      expect(chosen(state)).toBeUndefined();
      expect(plan(state).blocked.one).toContain('slots full');
    });
    it('requires toolchain and OS eligibility, including fallback', () => {
      const state = states();
      state['skr-studio']!.platform = 'linux';
      expect(chosen(state, { ...job, requires: ['ios'] })).toBe('skr-sonha');
      state['skr-sonha']!.healthy = false;
      state.m4!.healthy = false;
      expect(chosen(state, { ...job, requires: ['ios'] })).toBeUndefined();
      expect(plan(state, { ...job, requires: ['ios'] }).blocked.one).toContain(
        'missing capabilities'
      );
    });
    it.each([
      { healthy: false, reason: 'runner telemetry is stale' },
      {
        healthy: true,
        diskFreeGiB: undefined,
        loadPerCpu: 0.2,
        platform: 'darwin',
      },
      {
        healthy: true,
        diskFreeGiB: 400,
        loadPerCpu: undefined,
        platform: 'darwin',
      },
      {
        healthy: true,
        diskFreeGiB: Number.NaN,
        loadPerCpu: 0.2,
        platform: 'darwin',
      },
    ])('skips unknown or stale telemetry: %j', (bad) => {
      const state = states();
      state['skr-studio'] = bad;
      expect(chosen(state)).toBe('skr-sonha');
    });
    it('uses the 50 GiB disk floor remotely and locally, with configurable floors', () => {
      const state = states();
      state['skr-studio']!.diskFreeGiB = 49.9;
      expect(chosen(state)).toBe('skr-sonha');
      state['skr-studio']!.diskFreeGiB = 50;
      state['skr-studio']!.loadPerCpu = 0;
      expect(chosen(state)).toBe('skr-studio');
      const local = {
        ...registry,
        hosts: registry.hosts.filter((host) => host.kind === 'local'),
      };
      state.m4!.diskFreeGiB = 49;
      expect(planAdmissions(local, state, [], [job]).assignments).toEqual([]);
      const lowered = {
        ...local,
        hosts: local.hosts.map((host) => ({ ...host, minDiskFreeGiB: 40 })),
      };
      expect(
        planAdmissions(lowered, state, [], [job]).assignments
      ).toHaveLength(1);
    });
    it('refuses a one-shot busy invocation and leaves no ticket or reservation', async () => {
      const home = await mkdtemp(join(tmpdir(), 'ttr-auto-'));
      dirs.push(home);
      const runLocal = vi.fn(async () => 0);
      const deps: HostDispatchDeps = {
        fleet: async () => undefined,
        commitPlan: async () => undefined,
        runLocal,
        runRemote: async () => 0,
        localDiskFreeGiB: async () => 49,
        log: () => {},
      };
      expect(
        await hostsRun({
          home,
          command: 'node',
          args: ['-e', ''],
          jobClass: 'heavy',
          registry,
          deps,
          auto: true,
        })
      ).toBe(75);
      expect(runLocal).not.toHaveBeenCalled();
      expect(await hostLedger(home)).toEqual({ reservations: [], tickets: [] });
    });
    it('dispatches to free Sonha without waiting on full Thanh, and rechecks after all-full', async () => {
      for (const initiallyFull of [false, true]) {
        const home = await mkdtemp(join(tmpdir(), 'ttr-auto-'));
        dirs.push(home);
        let probes = 0;
        const fleet = async (): Promise<DevboxFleetSnapshot> => {
          probes += 1;
          const now = new Date().toISOString();
          return {
            server_time: now,
            runs: [],
            leases: [],
            runners: registry.hosts
              .filter((host) => host.kind === 'runner')
              .map((host) => ({
                id: host.runnerId!,
                name: host.id,
                status: 'online',
                last_heartbeat_at: now,
                heartbeat_enabled: true,
                enabled_features: { run: true },
                resource_limits: null,
                capabilities: {
                  executionMode: 'trusted',
                  protocols: { commitRun: [1] },
                  os: { platform: host.platform },
                  disk: { freeGiB: 100 },
                  resources: { loadAverage: [2], cpu: { cores: 32 } },
                },
                activity: {
                  queued_runs: 0,
                  running_runs: 0,
                  active_leases: 0,
                },
              })),
          };
        };
        const runRemote = vi.fn<HostDispatchDeps['runRemote']>(async () => 0);
        const log = vi.fn();
        const args = ['literal with spaces', '$(exit 99)', '--workers=99'];
        expect(
          await hostsRun({
            home,
            command: 'bun',
            args,
            jobClass: 'heavy',
            registry,
            auto: true,
            deps: {
              fleet,
              probeHosts: async () =>
                Object.fromEntries(
                  registry.hosts
                    .filter((host) => host.kind === 'runner')
                    .map((host) => [
                      host.id,
                      {
                        healthy: true as const,
                        sample: {
                          platform: host.platform,
                          occupied:
                            host.id === 'skr-sonha' &&
                            (!initiallyFull || probes > 1)
                              ? 0
                              : host.id === 'skr-studio'
                                ? 8
                                : 4,
                          waiting: host.id === 'skr-studio' ? 22 : 0,
                          effectiveLanes: host.id === 'skr-studio' ? 8 : 4,
                          diskFreeGiB: 100,
                          loadPerCpu: 0.2,
                        },
                      },
                    ])
                ),
              commitPlan: async () => ({
                sha: 'a'.repeat(40),
                prefix: 'packages/sdk',
              }),
              runLocal: async () => {
                throw new Error('must offload');
              },
              runRemote,
              localDiskFreeGiB: async () => 49,
              pollMs: 1,
              log,
            },
          })
        ).toBe(0);
        expect(runRemote).toHaveBeenCalledOnce();
        expect(runRemote.mock.calls[0]?.[0]).toMatchObject({
          host: { id: 'skr-sonha' },
          sha: 'a'.repeat(40),
          prefix: 'packages/sdk',
        });
        expect(
          log.mock.calls.some((call) =>
            String(call[0]).includes('all eligible hosts full')
          )
        ).toBe(initiallyFull);
        expect(await hostLedger(home)).toEqual({
          reservations: [],
          tickets: [],
        });
        expect(args).toEqual([
          'literal with spaces',
          '$(exit 99)',
          '--workers=99',
        ]);
      }
    });
    it('dry-run explains without launching or creating ledger files', async () => {
      const home = await mkdtemp(join(tmpdir(), 'ttr-auto-'));
      dirs.push(home);
      const runLocal = vi.fn(async () => 0);
      const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      expect(
        await hostsRun({
          home,
          command: 'node',
          args: ['-e', ''],
          jobClass: 'heavy',
          registry,
          auto: true,
          dryRun: true,
          deps: {
            fleet: async () => undefined,
            commitPlan: async () => undefined,
            runLocal,
            runRemote: async () => 0,
            localDiskFreeGiB: async () => 100,
          },
        })
      ).toBe(0);
      expect(String(out.mock.calls[0]?.[0])).toContain('local');
      expect(runLocal).not.toHaveBeenCalled();
      await expect(
        readFile(join(home, 'hosts-state/queue'))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  }
);

describe('admission disk floor and command integrity', () => {
  const volume = (free: number) => async () => ({
    freeBytes: free * 1024 ** 3,
    totalBytes: 500 * 1024 ** 3,
    inodeFreePercent: 50,
  });
  it('refuses below 50 GiB and admits at/above it; explicit floors remain configurable', async () => {
    expect(await diskGate('/job', {}, volume(49.9))).toMatchObject({
      admit: false,
    });
    expect(await diskGate('/job', {}, volume(50))).toMatchObject({
      admit: true,
    });
    expect(
      await diskGate('/job', { TTR_RESOURCES_MIN_FREE_GIB: '60' }, volume(55))
    ).toMatchObject({ admit: false });
    expect(
      await diskGate('/job', { TTR_RESOURCES_MIN_FREE_GIB: '40' }, volume(49))
    ).toMatchObject({ admit: true });
    expect(
      await diskGate('/job', { TTR_RESOURCES_MIN_FREE_GIB: 'bad' }, volume(100))
    ).toMatchObject({ admit: false, unknown: true });
  });
  it('admits large volumes above the absolute floor without a default percentage refusal', async () => {
    const large = async () => ({
      freeBytes: 316 * 1024 ** 3,
      totalBytes: 7449 * 1024 ** 3,
      inodeFreePercent: 98,
    });
    expect(await diskGate('/job', {}, large)).toMatchObject({ admit: true });
    expect(
      await diskGate('/job', { TTR_STORAGE_MIN_FREE_PERCENT: '5' }, large)
    ).toMatchObject({ admit: false });
  });
  it('round trips argv and explicit env values through the remote envelope without shell expansion', () => {
    const value = ' spaces $HOME $(exit 99) `exit 99` ; " \\ newline\n';
    const argv = [
      '/usr/bin/env',
      `TTR_LITERAL=${value}`,
      process.execPath,
      '-e',
      'process.stdout.write(JSON.stringify({args:process.argv.slice(1),value:process.env.TTR_LITERAL}))',
      value,
      '--workers=99',
    ];
    const decoded = decodeCommitRun(
      commitRunCommand('a'.repeat(40), 'packages/sdk', argv)
    );
    expect(decoded.command).toEqual(argv);
    const output = execFileSync(decoded.command[0]!, decoded.command.slice(1), {
      encoding: 'utf8',
      shell: false,
    });
    expect(JSON.parse(output)).toEqual({
      args: [value, '--workers=99'],
      value,
    });
  });
});
