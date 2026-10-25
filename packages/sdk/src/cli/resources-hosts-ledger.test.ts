import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevboxFleetSnapshot } from '../devbox-fleet-types';
import {
  type HostRegistry,
  proposedHostRegistry,
} from './resources-hosts-config';
import { type HostDispatchDeps, hostsRun } from './resources-hosts-dispatch';
import {
  admitHostTicket,
  enqueueHostTicket,
  type HostTicket,
  hostLedger,
  releaseHostReservation,
} from './resources-hosts-ledger';
import { bun } from './resources-test-fixtures';

const ledgerModule = resolve('src/cli/resources-hosts-ledger.ts');
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
    await mkdtemp(join(tmpdir(), 'ttr-resources-hosts-'))
  );
  dirs.push(path);
  return path;
}
const base = {
  ...proposedHostRegistry('runner-linux'),
  hubHostname: hostname(),
};
const localOnly = (light: number, heavy = 0): HostRegistry => ({
  ...base,
  hosts: [{ ...base.hosts[0]!, slots: { light, heavy } }],
});
const ticket = (jobClass: 'light' | 'heavy' = 'light'): HostTicket => ({
  token: randomUUID(),
  pid: process.pid,
  project: 'tuturuuu',
  jobClass,
  queuedAt: Date.now(),
  bypassed: 0,
  remoteOk: false,
});
function child(script: string, path: string) {
  const file = join(path, `${randomUUID()}.ts`);
  const process_ = (async () => {
    await writeFile(file, script);
    const proc = spawn(bun, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(proc);
    let err = '';
    proc.stderr.on('data', (chunk) => {
      err += chunk;
    });
    const code = await new Promise<number | null>((done) =>
      proc.once('exit', (exit, signal) => done(exit ?? (signal ? 128 : null)))
    );
    return { code, err, pid: proc.pid! };
  })();
  return process_;
}
const events = async (path: string) =>
  (await readFile(path, 'utf8').catch(() => ''))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          kind: string;
          id: string;
          at: number;
          held: number;
        }
    );

describe('canonical reservations', { timeout: 60_000 }, () => {
  it('reuses an unchanged queued ticket without erasing its bypass count', async () => {
    const path = await home();
    const original = ticket();
    await enqueueHostTicket(path, { ...original, bypassed: 3 });
    await enqueueHostTicket(path, original);
    expect((await hostLedger(path)).tickets).toMatchObject([
      { token: original.token, bypassed: 3 },
    ]);
    const result = await admitHostTicket(path, original, localOnly(1), {
      localDiskFreeGiB: 100,
    });
    expect(result.admitted && result.ticket.bypassed).toBe(3);
    if (result.admitted) await releaseHostReservation(path, result.reservation);
  });

  it('refuses to replace a ticket owner, age or capability requirement', async () => {
    const path = await home();
    const original: HostTicket = { ...ticket(), requires: ['ios'] };
    await enqueueHostTicket(path, original);
    for (const changed of [
      { ...original, pid: original.pid + 1 },
      { ...original, queuedAt: original.queuedAt + 1 },
      { ...original, requires: [] },
    ]) {
      await expect(enqueueHostTicket(path, changed)).rejects.toThrow(
        /identity changed/u
      );
      await expect(
        admitHostTicket(path, changed, localOnly(1), { localDiskFreeGiB: 100 })
      ).rejects.toThrow(/identity changed/u);
    }
    expect((await hostLedger(path)).tickets).toEqual([original]);
  });

  it('refuses to enqueue an already reserved token or admit it twice', async () => {
    const path = await home();
    const original = ticket();
    await enqueueHostTicket(path, original);
    const result = await admitHostTicket(path, original, localOnly(2), {
      localDiskFreeGiB: 100,
    });
    expect(result.admitted).toBe(true);
    await expect(enqueueHostTicket(path, original)).rejects.toThrow(
      /already has a reservation/u
    );
    expect(
      await admitHostTicket(path, original, localOnly(2), {
        localDiskFreeGiB: 100,
      })
    ).toEqual({ admitted: false, reason: 'ticket is no longer queued' });
    expect((await hostLedger(path)).reservations).toHaveLength(1);
    if (result.admitted) await releaseHostReservation(path, result.reservation);
  });

  it('never double-assigns a slot under concurrent requests', async () => {
    const path = await home();
    const log = join(path, 'events.jsonl');
    const registry = localOnly(2);
    const script = (id: string) => `
      import {admitHostTicket,enqueueHostTicket,releaseHostReservation} from ${JSON.stringify(ledgerModule)};
      import {appendFileSync,readdirSync} from 'node:fs';
      const home=${JSON.stringify(path)};const registry=${JSON.stringify(registry)};
      const ticket={token:crypto.randomUUID(),pid:process.pid,project:'p${id}',jobClass:'light',queuedAt:Date.now(),bypassed:0,remoteOk:false};
      await enqueueHostTicket(home,ticket);
      let result;while(!(result=await admitHostTicket(home,ticket,registry,{localDiskFreeGiB:100})).admitted)await Bun.sleep(5);
      const held=readdirSync(home+'/hosts-state/reservations/m4').filter((n)=>n.endsWith('.json')).length;
      appendFileSync(${JSON.stringify(log)},JSON.stringify({kind:'start',id:'${id}',at:Date.now(),held})+'\\n');
      await Bun.sleep(120);
      appendFileSync(${JSON.stringify(log)},JSON.stringify({kind:'end',id:'${id}',at:Date.now(),held})+'\\n');
      await releaseHostReservation(home,result.reservation);`;
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => child(script(String(i)), path))
    );
    for (const result of results) expect(result.code, result.err).toBe(0);
    const log_ = await events(log);
    expect(log_.filter((entry) => entry.kind === 'start')).toHaveLength(8);
    // The ledger never held more than the two light slots.
    expect(Math.max(...log_.map((entry) => entry.held))).toBeLessThanOrEqual(2);
    let live = 0;
    let peak = 0;
    for (const entry of [...log_].sort(
      (a, b) => a.at - b.at || (a.kind === 'end' ? -1 : 1)
    )) {
      live += entry.kind === 'start' ? 1 : -1;
      peak = Math.max(peak, live);
    }
    expect(peak).toBeLessThanOrEqual(2);
    expect((await hostLedger(path)).reservations).toEqual([]);
  });

  it('frees the slot when the owning process dies', async () => {
    const path = await home();
    const registry = localOnly(1);
    const ready = join(path, 'holder.ready');
    const holder = child(
      `import {admitHostTicket,enqueueHostTicket} from ${JSON.stringify(ledgerModule)};
      import {writeFileSync} from 'node:fs';
      const home=${JSON.stringify(path)};const registry=${JSON.stringify(registry)};
      const ticket={token:crypto.randomUUID(),pid:process.pid,project:'holder',jobClass:'light',queuedAt:Date.now(),bypassed:0,remoteOk:false};
      await enqueueHostTicket(home,ticket);
      while(!(await admitHostTicket(home,ticket,registry,{localDiskFreeGiB:100})).admitted)await Bun.sleep(5);
      writeFileSync(${JSON.stringify(ready)},'');await Bun.sleep(60000);`,
      path
    );
    while (
      !(await readFile(ready).then(
        () => true,
        () => false
      ))
    )
      await sleep(20);
    const mine = ticket();
    await enqueueHostTicket(path, mine);
    expect(
      await admitHostTicket(path, mine, registry, { localDiskFreeGiB: 100 })
    ).toMatchObject({
      admitted: false,
      reason: expect.stringMatching(/light slots full/u),
    });
    children.at(-1)!.kill('SIGKILL');
    await holder;
    expect(
      await admitHostTicket(path, mine, registry, { localDiskFreeGiB: 100 })
    ).toMatchObject({ admitted: true });
  });

  it('releases its slot and ticket on cancellation', async () => {
    const path = await home();
    const registry = localOnly(1);
    const script = (name: string) => `
      import {hostsRun} from ${JSON.stringify(dispatchModule)};
      import {writeFileSync} from 'node:fs';
      process.exitCode=await hostsRun({home:${JSON.stringify(path)},command:'probe',args:[],jobClass:'light',registry:${JSON.stringify(registry)},deps:{
        fleet:async()=>undefined,commitPlan:async()=>undefined,localDiskFreeGiB:async()=>100,localDiskGate:async()=>({admit:true,freeGiB:100}),pollMs:10,log:(t)=>{if(t.startsWith('queued'))writeFileSync(${JSON.stringify(join(path, `${name}.queued`))},'')},
        runLocal:()=>new Promise((done)=>{writeFileSync(${JSON.stringify(join(path, `${name}.running`))},'');process.once('SIGTERM',()=>done(143));}),
        runRemote:async()=>1}});`;
    const until = async (file: string) => {
      while (
        !(await readFile(join(path, file)).then(
          () => true,
          () => false
        ))
      )
        await sleep(20);
    };
    const running = child(script('a'), path);
    await until('a.running');
    const runner = children.at(-1)!;
    const queued = child(script('b'), path);
    await until('b.queued');
    const waiter = children.at(-1)!;
    expect((await hostLedger(path)).tickets).toHaveLength(1);
    waiter.kill('SIGTERM');
    expect((await queued).code).toBe(143);
    expect((await hostLedger(path)).tickets).toEqual([]);
    runner.kill('SIGTERM');
    expect((await running).code).toBe(143);
    expect((await hostLedger(path)).reservations).toEqual([]);
  });
});

describe('multi-host dispatch', { timeout: 30_000 }, () => {
  const now = () => new Date().toISOString();
  const fleet = (heartbeat: () => string) => async () =>
    ({
      runners: [
        {
          id: 'runner-linux',
          name: 'skr-linux-lan',
          status: 'online',
          last_heartbeat_at: heartbeat(),
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
        },
      ],
      runs: [],
      leases: [],
      server_time: now(),
    }) as unknown as DevboxFleetSnapshot;
  const registry: HostRegistry = {
    ...base,
    hosts: [
      { ...base.hosts[0]!, slots: { light: 0, heavy: 1 } },
      { ...base.hosts[1]!, slots: { light: 0, heavy: 1 } },
    ],
  };
  function deps(snapshot: HostDispatchDeps['fleet']) {
    const runs: { host: string; start: number; end: number }[] = [];
    const work = async (host: string) => {
      const start = Date.now();
      await sleep(300);
      runs.push({ host, start, end: Date.now() });
      return 0;
    };
    const value: HostDispatchDeps = {
      fleet: snapshot,
      commitPlan: async () => ({ sha: 'a'.repeat(40), prefix: '' }),
      localDiskFreeGiB: async () => 100,
      runLocal: ({ host }) => work(host.id),
      runRemote: ({ host }) => work(host.id),
      pollMs: 10,
      log: () => {},
    };
    return { runs, value };
  }
  const job = (path: string, value: HostDispatchDeps) =>
    hostsRun({
      home: path,
      command: 'vitest',
      args: ['run'],
      jobClass: 'heavy',
      registry,
      deps: value,
    });

  it('overlaps two disjoint heavy jobs on two hosts', async () => {
    const path = await home();
    const { runs, value } = deps(fleet(now));
    expect(await Promise.all([job(path, value), job(path, value)])).toEqual([
      0, 0,
    ]);
    expect(runs.map((run) => run.host).sort()).toEqual(['m4', 'skr-linux-lan']);
    const [a, b] = runs;
    expect(a!.start < b!.end && b!.start < a!.end).toBe(true);
  });

  it.each([
    [
      'goes stale',
      (fresh: string) => ({
        heartbeat: new Date(Date.parse(fresh) - 10 * 60_000).toISOString(),
        server: fresh,
      }),
    ],
    [
      'loses its server timestamp',
      (fresh: string) => ({ heartbeat: fresh, server: undefined }),
    ],
  ] as const)(
    'revalidates the runner right before remote creation and requeues when it %s (REV-6503-3)',
    async (_, after) => {
      const path = await home();
      let calls = 0;
      // Admission sees a fresh runner; every later snapshot (the pre-dispatch
      // revalidation and the requeued rounds) does not.
      const racing: HostDispatchDeps['fleet'] = async () => {
        calls += 1;
        const fresh = new Date().toISOString();
        const state =
          calls === 1 ? { heartbeat: fresh, server: fresh } : after(fresh);
        const snapshot = (await fleet(
          () => state.heartbeat
        )()) as DevboxFleetSnapshot & {
          server_time?: string;
        };
        snapshot.server_time = state.server;
        return snapshot;
      };
      const { runs, value } = deps(racing);
      const remote = vi.fn(value.runRemote);
      expect(await job(path, { ...value, runRemote: remote })).toBe(0);
      expect(remote).not.toHaveBeenCalled();
      expect(runs.map((run) => run.host)).toEqual(['m4']);
      expect(calls).toBeGreaterThanOrEqual(2);
      expect((await hostLedger(path)).reservations).toEqual([]);
    }
  );

  it('never admits a stale runner; work serialises on the healthy host', async () => {
    const path = await home();
    const stale = () => new Date(Date.now() - 10 * 60_000).toISOString();
    const { runs, value } = deps(fleet(stale));
    expect(await Promise.all([job(path, value), job(path, value)])).toEqual([
      0, 0,
    ]);
    expect(runs.map((run) => run.host)).toEqual(['m4', 'm4']);
    const [a, b] = runs.sort((x, y) => x.start - y.start);
    expect(b!.start).toBeGreaterThanOrEqual(a!.end);
  });
});
