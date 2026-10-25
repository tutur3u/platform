import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import { atomicJson } from './resources-config';
import { hostsJobClass } from './resources-hosts-cli';
import {
  type HostRegistry,
  proposedHostRegistry,
} from './resources-hosts-config';
import {
  type HostDispatchDeps,
  hostsRun,
  projectIdentity,
} from './resources-hosts-dispatch';
import {
  hostLedger,
  hostReservationMarker,
  nestedHostReservation,
  reservationPath,
} from './resources-hosts-ledger';
import { bun } from './resources-test-fixtures';

const dispatchModule = resolve('src/cli/resources-hosts-dispatch.ts');
const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0))
    if (child.exitCode === null) child.kill('SIGKILL');
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function home() {
  const path = await realpath(
    await mkdtemp(join(tmpdir(), 'ttr-hosts-dispatch-'))
  );
  dirs.push(path);
  return path;
}
const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false
  );
const until = async (path: string) => {
  const end = Date.now() + 15_000;
  while (!(await exists(path))) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${path}`);
    await sleep(20);
  }
};
const base = proposedHostRegistry('runner-linux');
const fleet = async () =>
  ({
    runners: [
      {
        id: 'runner-linux',
        name: 'skr-linux-lan',
        status: 'online',
        last_heartbeat_at: new Date().toISOString(),
        heartbeat_enabled: true,
        enabled_features: { run: true },
        resource_limits: null,
        capabilities: {
          executionMode: 'trusted',
          protocols: { commitRun: [1] },
          resources: {
            loadAverage: [4, 4, 4],
            cpu: { cores: 20 },
            disk: { freeGiB: 400, freePct: 85 },
          },
        },
        drain_requested_at: null,
        activity: { queued_runs: 0, running_runs: 0, active_leases: 0 },
      },
    ],
    runs: [],
    leases: [],
    server_time: new Date().toISOString(),
  }) as unknown as DevboxFleetSnapshot;
const quiet: Pick<HostDispatchDeps, 'log' | 'pollMs' | 'localDiskFreeGiB'> = {
  log: () => {},
  pollMs: 10,
  localDiskFreeGiB: async () => 100,
};

describe('project identity', () => {
  it('shares one identity between a repository and its linked worktrees', async () => {
    const root = await home();
    const repo = join(root, 'repo');
    const gitdir = join(repo, '.git', 'worktrees', 'lane');
    await mkdir(gitdir, { recursive: true });
    await writeFile(join(gitdir, 'commondir'), '../..\n');
    const worktree = join(root, 'lane');
    await mkdir(join(worktree, 'src'), { recursive: true });
    await writeFile(join(worktree, '.git'), `gitdir: ${gitdir}\n`);
    expect(projectIdentity(join(repo, 'src'))).toBe(join(repo, '.git'));
    expect(projectIdentity(join(worktree, 'src'))).toBe(join(repo, '.git'));
    expect(projectIdentity(join(root, 'none'))).toBe(join(root, 'none'));
  });
});

describe('--hosts job class (REV-6503-4)', () => {
  it('treats explicit --hosts jobs as heavy unless --class light', () => {
    expect(hostsJobClass(undefined)).toBe('heavy');
    expect(hostsJobClass('heavy')).toBe('heavy');
    expect(hostsJobClass('light')).toBe('light');
    expect(() => hostsJobClass('tiny')).toThrow(/light or heavy/u);
  });

  it('sends local light work through the dequeue disk gate', async () => {
    const path = await home();
    const registry: HostRegistry = {
      ...base,
      hosts: [{ ...base.hosts[0]!, slots: { light: 1, heavy: 0 } }],
    };
    const gate = vi
      .fn()
      .mockResolvedValueOnce({
        admit: false,
        unknown: true,
        reason: 'free disk on the job volume is unknown (EIO)',
      })
      .mockResolvedValue({ admit: true, freeGiB: 100 });
    const runLocal = vi.fn(async () => {
      // While blocked the slot was released, so the ledger holds only us now.
      expect((await hostLedger(path)).reservations).toHaveLength(1);
      return 0;
    });
    expect(
      await hostsRun({
        home: path,
        command: 'eslint',
        args: ['--cwd', path, 'file.ts'],
        jobClass: 'light',
        registry,
        deps: {
          ...quiet,
          fleet,
          commitPlan: async () => undefined,
          localDiskGate: gate,
          runLocal,
          runRemote: async () => 1,
        },
      })
    ).toBe(0);
    expect(gate).toHaveBeenCalledTimes(2);
    expect(gate).toHaveBeenNthCalledWith(1, path);
    expect(gate).toHaveBeenNthCalledWith(2, path);
    expect(runLocal).toHaveBeenCalledTimes(1);
  });
});

describe('nested --hosts under an admitted reservation (REV-6503-5)', {
  timeout: 30_000,
}, () => {
  it('runs a nested light job under its ancestor reservation instead of deadlocking', async () => {
    const path = await home();
    const registry: HostRegistry = {
      ...base,
      hosts: [{ ...base.hosts[0]!, slots: { light: 1, heavy: 0 } }],
    };
    const nestedRan = join(path, 'nested.ran');
    const nested = join(path, 'nested.ts');
    await writeFile(
      nested,
      `import {hostsRun} from ${JSON.stringify(dispatchModule)};import {writeFileSync} from 'node:fs';
      process.exitCode=await hostsRun({home:${JSON.stringify(path)},command:'inner',args:[],jobClass:'light',registry:${JSON.stringify(registry)},deps:{
        fleet:async()=>undefined,commitPlan:async()=>undefined,localDiskFreeGiB:async()=>100,localDiskGate:async()=>({admit:true}),pollMs:10,log:()=>{},
        runLocal:async({reservation})=>{writeFileSync(${JSON.stringify(nestedRan)},reservation.token);return 0},runRemote:async()=>1}});`
    );
    let outerToken = '';
    const code = await hostsRun({
      home: path,
      command: 'outer',
      args: [],
      jobClass: 'light',
      registry,
      deps: {
        ...quiet,
        fleet,
        commitPlan: async () => undefined,
        localDiskGate: async () => ({ admit: true, freeGiB: 100 }),
        runRemote: async () => 1,
        runLocal: ({ reservation, marker }) =>
          new Promise<number>((done) => {
            outerToken = reservation.token;
            const child = spawn(bun, [nested], {
              env: { ...process.env, ...marker },
              stdio: 'ignore',
            });
            children.push(child);
            child.once('exit', (exit) => done(exit ?? 1));
          }),
      },
    });
    expect(code).toBe(0);
    // The nested job ran under the outer reservation, not a second slot.
    expect(await readFile(nestedRan, 'utf8')).toBe(outerToken);
    expect((await hostLedger(path)).reservations).toEqual([]);
  });

  it('ignores a copied marker outside the reservation owner process tree', async () => {
    const path = await home();
    const unrelated = spawn('sleep', ['30'], { stdio: 'ignore' });
    children.push(unrelated);
    const token = randomUUID();
    await atomicJson(reservationPath(path, 'm4', token), {
      token,
      pid: unrelated.pid,
      hostId: 'm4',
      jobClass: 'light',
      project: 'p',
      scope: 'host',
      createdAt: new Date().toISOString(),
    });
    expect(
      await nestedHostReservation(
        path,
        { [hostReservationMarker]: token },
        true
      )
    ).toBeUndefined();
    // A project-scoped entry never acts as a host reservation either.
    await atomicJson(reservationPath(path, 'm4', token), {
      token,
      pid: process.pid,
      hostId: 'm4',
      jobClass: 'light',
      project: 'p',
      scope: 'project',
      createdAt: new Date().toISOString(),
    });
    expect(
      await nestedHostReservation(
        path,
        { [hostReservationMarker]: token },
        true
      )
    ).toBeUndefined();
  });
});

describe('remote dispatch safeguards', { timeout: 30_000 }, () => {
  const twoHosts: HostRegistry = {
    ...base,
    hosts: [
      { ...base.hosts[0]!, slots: { light: 0, heavy: 1 } },
      { ...base.hosts[1]!, slots: { light: 0, heavy: 1 } },
    ],
  };

  it('falls back to local when the commit plan changed before dispatch (REV-6503-7)', async () => {
    const path = await home();
    const plans = [
      { sha: 'a'.repeat(40), prefix: '' },
      { sha: 'b'.repeat(40), prefix: '' },
    ];
    let call = 0;
    const runRemote = vi.fn(async () => 0);
    const runLocal = vi.fn(async () => 0);
    expect(
      await hostsRun({
        home: path,
        command: 'vitest',
        args: ['run'],
        jobClass: 'heavy',
        registry: twoHosts,
        deps: {
          ...quiet,
          fleet,
          commitPlan: async () => plans[Math.min(call++, 1)],
          runLocal,
          runRemote,
        },
      })
    ).toBe(0);
    expect(runRemote).not.toHaveBeenCalled();
    expect(runLocal).toHaveBeenCalledTimes(1);
  });

  it('fails fast when no host could ever hold the job (REV-6503-9)', async () => {
    const path = await home();
    const remoteOnly: HostRegistry = {
      ...base,
      hosts: [
        { ...base.hosts[0]!, slots: { light: 0, heavy: 0 } },
        { ...base.hosts[1]!, slots: { light: 0, heavy: 2 } },
      ],
    };
    await expect(
      hostsRun({
        home: path,
        command: 'vitest',
        args: ['run'],
        jobClass: 'heavy',
        registry: remoteOnly,
        deps: {
          ...quiet,
          fleet,
          // A dirty tree cannot run remotely, and no local host holds heavy.
          commitPlan: async () => undefined,
          runLocal: async () => 0,
          runRemote: async () => 0,
        },
      })
    ).rejects.toThrow(/No registered host can ever run a heavy job/u);
    expect((await hostLedger(path)).tickets).toEqual([]);
  });

  it('forwards SIGHUP to the remote run cancellation (REV-6503-10)', async () => {
    const path = await home();
    const remoteOnly: HostRegistry = {
      ...base,
      hosts: [
        { ...base.hosts[0]!, slots: { light: 0, heavy: 0 } },
        { ...base.hosts[1]!, slots: { light: 0, heavy: 1 } },
      ],
    };
    const running = join(path, 'remote.running');
    const stopped = join(path, 'remote.sigterm');
    const script = join(path, 'remote.ts');
    await writeFile(
      script,
      `import {hostsRun} from ${JSON.stringify(dispatchModule)};import {writeFileSync} from 'node:fs';
      const fleet=async()=>({runners:[{id:'runner-linux',name:'l',status:'online',last_heartbeat_at:new Date().toISOString(),heartbeat_enabled:true,enabled_features:{run:true},resource_limits:null,capabilities:{executionMode:'trusted',protocols:{commitRun:[1]},resources:{loadAverage:[4,4,4],cpu:{cores:20},disk:{freeGiB:400,freePct:85}}},drain_requested_at:null,activity:{queued_runs:0,running_runs:0,active_leases:0}}],runs:[],leases:[],server_time:new Date().toISOString()});
      process.exitCode=await hostsRun({home:${JSON.stringify(path)},command:'vitest',args:[],jobClass:'heavy',registry:${JSON.stringify(remoteOnly)},deps:{
        fleet,commitPlan:async()=>({sha:'${'c'.repeat(40)}',prefix:''}),localDiskFreeGiB:async()=>100,pollMs:10,log:()=>{},runLocal:async()=>1,
        // Like runBoxOffload: stops the remote run on SIGTERM/SIGINT only.
        runRemote:()=>new Promise((done)=>{process.once('SIGTERM',()=>{writeFileSync(${JSON.stringify(stopped)},'');done(143)});writeFileSync(${JSON.stringify(running)},'');})}});`
    );
    const child = spawn(bun, [script], { stdio: 'ignore' });
    children.push(child);
    const exited = new Promise<number | null>((done) =>
      child.once('exit', (code) => done(code))
    );
    await until(running);
    child.kill('SIGHUP');
    expect(await exited).toBe(143);
    expect(await exists(stopped)).toBe(true);
    expect((await hostLedger(path)).reservations).toEqual([]);
  });
});
