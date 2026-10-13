import { type ChildProcess, spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { limitCommand, realExecutable } from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  laneResourceConfig,
  readResourceConfig,
  resourceLanes,
} from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import { setupResources } from './resources-setup';
import {
  newOwner,
  occupancy,
  ownerState,
  processGroupAlive,
  releaseSlot,
  withAdmission,
} from './resources-slots';

const bun = realExecutable('bun', '/nonexistent');
const realNode = realExecutable('node', '/nonexistent');
const fixturePath = [dirname(realNode), dirname(bun), '/usr/bin', '/bin'].join(
  delimiter
);
const entry = resolve('src/cli/resources-entry.ts');
const queueModule = resolve('src/cli/resources-queue.ts');
const dirs: string[] = [];
const children: ChildProcess[] = [];
const timeout = 15_000;
async function until(check: () => Promise<boolean>) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out at resource fixture barrier.');
}
const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false
  );
async function home(lanes = 2) {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'ttr-lanes-test-')));
  dirs.push(path);
  await atomicJson(join(path, 'config.json'), {
    ...defaultResourceConfig(),
    roots: [path],
    validationLanes: lanes,
    vitestWorkers: 2,
    buildJobs: 2,
  });
  return path;
}
function launch(
  path: string,
  args: string[],
  customEntry = entry,
  env: NodeJS.ProcessEnv = {}
) {
  const child = spawn(bun, [customEntry, ...args], {
    cwd: path,
    env: {
      ...process.env,
      PATH: fixturePath,
      ...env,
      TTR_RESOURCES_HOME: path,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', (chunk) => {
    err += chunk;
  });
  const done = new Promise<{ code: number | null; out: string; err: string }>(
    (resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, out, err }));
    }
  );
  return { child, done };
}
async function held(path: string, name: string, drain = false) {
  const source = join(path, `${name}.cjs`);
  await writeFile(
    source,
    `const fs=require('fs');const base=${JSON.stringify(join(path, name))};fs.writeFileSync(base+'.ready','');${drain ? "process.on('SIGTERM',()=>fs.writeFileSync(base+'.signal',''));" : ''}const timer=setInterval(()=>{if(fs.existsSync(base+'.release')){clearInterval(timer);process.exit(0)}},10);`
  );
  return source;
}
const run = (path: string, source: string) =>
  launch(path, ['run', '--ignore-pressure', '--', 'node', source]);
async function waiting(path: string, count: number) {
  await until(
    async () => (await resourceQueueStatus(path, 2)).waiting.length === count
  );
}
async function release(path: string, name: string) {
  await writeFile(join(path, `${name}.release`), '');
}
afterEach(async () => {
  // Release only this test's children before terminating its brokers. No live home.
  for (const path of dirs) {
    for (const name of await readdir(path)) {
      if (name.endsWith('.cjs'))
        await writeFile(join(path, `${name.slice(0, -4)}.release`), '');
      if (name === 'receipt')
        await writeFile(join(path, 'receipt.release'), '');
      if (name.endsWith('.ready'))
        await writeFile(join(path, name.replace('.ready', '.release')), '');
    }
  }
  for (const child of children.splice(0))
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('lane policy', () => {
  it('preserves Bun run separators when clamping the underlying Turbo command', () => {
    expect(
      limitCommand(
        'bun',
        ['--no-install', 'run', 'turbo', '--', 'run', 'test'],
        defaultResourceConfig()
      )
    ).toEqual([
      '--no-install',
      'run',
      'turbo',
      '--',
      'run',
      'test',
      '--concurrency=1',
    ]);
  });
  it('reads legacy configs as one lane and rejects invalid counts', async () => {
    const path = await home();
    const old = defaultResourceConfig();
    delete old.validationLanes;
    await atomicJson(join(path, 'config.json'), old);
    expect(resourceLanes((await readResourceConfig(path))!)).toBe(1);
    for (const lanes of [0, 3, 1.5, '2', null]) {
      await atomicJson(join(path, 'config.json'), {
        ...old,
        validationLanes: lanes,
      });
      await expect(readResourceConfig(path)).rejects.toThrow();
    }
  });
  it('splits the aggregate worker budget and clamps explicit tool flags', () => {
    const config = {
      ...defaultResourceConfig(),
      validationLanes: 2 as const,
      vitestWorkers: 2,
      buildJobs: 2,
    };
    const caps = laneResourceConfig(config);
    expect([caps.vitestWorkers, caps.buildJobs, caps.turboConcurrency]).toEqual(
      [1, 1, 1]
    );
    expect(limitCommand('vitest', ['run', '--maxWorkers', '12'], caps)).toEqual(
      ['run', '--maxWorkers=1']
    );
    expect(limitCommand('cargo', ['test', '-j8'], caps)).toEqual([
      'test',
      '--jobs=1',
    ]);
    expect(() => laneResourceConfig({ ...config, vitestWorkers: 1 })).toThrow(
      'budget'
    );
    expect(() => laneResourceConfig({ ...config, vitestWorkers: 64 })).toThrow(
      'budget'
    );
  });
  it('preserves private shell contents and backups across lane setup and dry-run', async () => {
    const path = await home(1);
    const shells = join(path, 'shells');
    await mkdir(shells);
    const original = 'export CUSTOM=private-fixture\n';
    for (const name of ['.zshenv', '.zprofile', '.zshrc'])
      await writeFile(join(shells, name), original);
    const first = await launch(
      path,
      ['setup', '--shell', 'zsh', '--workers', '2'],
      entry,
      { ZDOTDIR: shells }
    ).done;
    expect(first.code, first.err).toBe(0);
    const before = await readFile(join(shells, '.zshrc'), 'utf8');
    const config = await readFile(join(path, 'config.json'), 'utf8');
    const dry = await launch(
      path,
      ['setup', '--lanes', '2', '--shell', 'zsh', '--dry-run'],
      entry,
      { ZDOTDIR: shells }
    ).done;
    expect(dry.code, dry.err).toBe(0);
    expect(await readFile(join(shells, '.zshrc'), 'utf8')).toBe(before);
    expect(await readFile(join(path, 'config.json'), 'utf8')).toBe(config);
    expect(
      (
        await launch(path, ['setup', '--lanes', '2', '--shell', 'zsh'], entry, {
          ZDOTDIR: shells,
        }).done
      ).code
    ).toBe(0);
    const after = await readFile(join(shells, '.zshrc'), 'utf8');
    expect(after).toBe(before);
    expect((await readResourceConfig(path))?.roots).toEqual([path]);
    for (const name of await readdir(join(path, 'backups')))
      expect(await readFile(join(path, 'backups', name), 'utf8')).toBe(
        original
      );
  });
  it('dry-runs without writes, preserves old roots/workers, and rejects bad CLI options', async () => {
    const path = await home(1);
    const before = await readFile(join(path, 'config.json'), 'utf8');
    const names = await readdir(path);
    const plan = await setupResources({
      home: path,
      roots: [path],
      shell: 'none',
      lanes: 2,
      dryRun: true,
    });
    expect(plan?.config.validationLanes).toBe(2);
    expect(plan?.config.vitestWorkers).toBe(2);
    expect(await readFile(join(path, 'config.json'), 'utf8')).toBe(before);
    expect(await readdir(path)).toEqual(names);
    for (const args of [
      ['setup', '--lanes', '3'],
      ['run', '--surprise', '--', 'node', '-e', '0'],
      ['status', '--surprise'],
    ])
      expect((await launch(path, args).done).code).toBe(1);
  });
});

describe('real cross-process lane admission', { timeout: 45_000 }, () => {
  it('overlaps two independent children, holds the third, and admits FIFO without exceeding two', async () => {
    const path = await home();
    const a = run(path, await held(path, 'a'));
    const b = run(path, await held(path, 'b'));
    await until(() => exists(join(path, 'a.ready')));
    await until(() => exists(join(path, 'b.ready')));
    const c = run(path, await held(path, 'c'));
    await waiting(path, 1);
    const d = run(path, await held(path, 'd'));
    await waiting(path, 2);
    expect(await exists(join(path, 'c.ready'))).toBe(false);
    expect(await exists(join(path, 'd.ready'))).toBe(false);
    const status = await launch(path, ['status', '--json']).done;
    const parsed = JSON.parse(status.out);
    expect(parsed.owners).toHaveLength(2);
    const textStatus = await launch(path, ['status']).done;
    for (const owner of parsed.owners)
      expect(textStatus.out).toContain(`PID ${owner.pid}`);
    expect(parsed.owner).not.toBeNull();
    expect(parsed.laneCount).toBe(2);
    expect(
      parsed.owners.map((owner: { limits: unknown }) => owner.limits)
    ).toEqual([
      { vitestWorkers: 1, buildJobs: 1 },
      { vitestWorkers: 1, buildJobs: 1 },
    ]);
    await release(path, 'a');
    expect((await a.done).code).toBe(0);
    await until(() => exists(join(path, 'c.ready')));
    expect(await exists(join(path, 'd.ready'))).toBe(false);
    expect((await resourceQueueStatus(path, 2)).owners).toHaveLength(2);
    await release(path, 'b');
    await b.done;
    await until(() => exists(join(path, 'd.ready')));
    await release(path, 'c');
    await release(path, 'd');
    expect((await c.done).code).toBe(0);
    expect((await d.done).code).toBe(0);
  });
  it('retains one-lane serialization', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const b = run(path, await held(path, 'b'));
    await waiting(path, 1);
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    await release(path, 'a');
    await a.done;
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'b');
    await b.done;
  });
  it('active legacy parent or child excludes both lanes until drain', async () => {
    const path = await home();
    const legacy = launch(path, [], await held(path, 'legacy'));
    await until(() => exists(join(path, 'legacy.ready')));
    const metadata = { ...newOwner('legacy'), pid: legacy.child.pid! };
    await mkdir(join(path, 'lock'));
    await atomicJson(join(path, 'lock', 'owner.json'), metadata);
    const a = run(path, await held(path, 'a'));
    const b = run(path, await held(path, 'b'));
    await waiting(path, 2);
    expect(await exists(join(path, 'a.ready'))).toBe(false);
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    // Model a dead supervisor with its actual live child still retained.
    await atomicJson(join(path, 'lock', 'owner.json'), {
      ...metadata,
      pid: 2147483647,
      childPid: legacy.child.pid,
    });
    const status = await resourceQueueStatus(path, 2);
    expect(status.owners).toHaveLength(1);
    expect(status.occupied).toBe(1);
    await release(path, 'legacy');
    await legacy.done;
    await until(() => exists(join(path, 'a.ready')));
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'a');
    await release(path, 'b');
    await a.done;
    await b.done;
  });
  it('actual nested shim finds any live ancestor, restores caps after filtering, and ignores forged tokens', async () => {
    const path = await home();
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const nested = join(path, 'nested.cjs');
    await writeFile(
      nested,
      `const fs=require('fs');const cp=require('child_process');const out=cp.execFileSync(${JSON.stringify(join(path, 'bin', 'node'))},['-e','console.log(process.env.VITEST_MAX_WORKERS+":"+process.env.CARGO_BUILD_JOBS)'],{env:{PATH:process.env.PATH},timeout:10000});fs.writeFileSync(${JSON.stringify(join(path, 'nested.result'))},out);`
    );
    const b = run(path, nested);
    const result = await b.done;
    expect(result.code, result.err).toBe(0);
    expect((await readFile(join(path, 'nested.result'), 'utf8')).trim()).toBe(
      '1:1'
    );
    const c = run(path, await held(path, 'c'));
    await until(() => exists(join(path, 'c.ready')));
    const fake = launch(
      path,
      ['run', '--ignore-pressure', '--', 'node', '-e', 'console.log(3)'],
      entry,
      { TTR_RESOURCE_OWNER: 'forged' }
    );
    await waiting(path, 1);
    expect(fake.child.exitCode).toBeNull();
    await release(path, 'c');
    await c.done;
    expect((await fake.done).code).toBe(0);
    await release(path, 'a');
    await a.done;
  });
  it('pressure blocks new admission while an active child continues', async () => {
    const path = await home();
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const runner = join(path, 'pressure.ts');
    const child = await held(path, 'b');
    await writeFile(
      runner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};import {existsSync,writeFileSync} from 'node:fs';process.exitCode=await queuedResourceCommand(${JSON.stringify(path)},'node',[${JSON.stringify(child)}],{...process.env,VITEST_MAX_WORKERS:'1',CARGO_BUILD_JOBS:'1'},false,2,async()=>{writeFileSync(${JSON.stringify(join(path, 'checked'))},'');return {blocked:!existsSync(${JSON.stringify(join(path, 'pressure.release'))}),reason:'fixture pressure'};});`
    );
    const b = launch(path, [], runner);
    await until(() => exists(join(path, 'checked')));
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    expect((await resourceQueueStatus(path, 2)).owners).toHaveLength(1);
    await writeFile(join(path, 'pressure.release'), '');
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'a');
    await release(path, 'b');
    await a.done;
    await b.done;
  });
  it('cancels only its own waiter and preserves FIFO siblings', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const b = run(path, await held(path, 'b'));
    await waiting(path, 1);
    const c = run(path, await held(path, 'c'));
    await waiting(path, 2);
    b.child.kill('SIGTERM');
    expect((await b.done).code).toBe(143);
    await waiting(path, 1);
    expect((await resourceQueueStatus(path)).owners).toHaveLength(1);
    await release(path, 'a');
    await a.done;
    await until(() => exists(join(path, 'c.ready')));
    await release(path, 'c');
    await c.done;
  });
  it('holds a cancelled lane until owned child drain and never releases its sibling', async () => {
    const path = await home();
    const a = run(path, await held(path, 'a', true));
    const b = run(path, await held(path, 'b'));
    await until(() => exists(join(path, 'a.ready')));
    await until(() => exists(join(path, 'b.ready')));
    const c = run(path, await held(path, 'c'));
    await waiting(path, 1);
    const sibling = (await resourceQueueStatus(path, 2)).owners.find(
      (owner) => owner.pid === b.child.pid
    );
    a.child.kill('SIGTERM');
    await until(() => exists(join(path, 'a.signal')));
    expect(await exists(join(path, 'c.ready'))).toBe(false);
    expect(a.child.exitCode).toBeNull();
    await release(path, 'a');
    expect((await a.done).code).toBe(143);
    await until(() => exists(join(path, 'c.ready')));
    expect(
      (await resourceQueueStatus(path, 2)).owners.find(
        (owner) => owner.pid === b.child.pid
      )?.token
    ).toBe(sibling?.token);
    await release(path, 'b');
    await release(path, 'c');
    await b.done;
    await c.done;
  });
  it('dead broker retains live child ownership, then reclaims only after child exit', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    await until(async () =>
      Boolean((await resourceQueueStatus(path)).owner?.childPid)
    );
    a.child.kill('SIGKILL');
    await a.done;
    const b = run(path, await held(path, 'b'));
    await waiting(path, 1);
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    await release(path, 'a');
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'b');
    await b.done;
  });
  it('rejects busy lane changes for owners and waiters', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const before = await readFile(join(path, 'config.json'), 'utf8');
    expect(
      (await launch(path, ['setup', '--lanes', '2', '--shell', 'none']).done)
        .code
    ).toBe(1);
    expect(await readFile(join(path, 'config.json'), 'utf8')).toBe(before);
    const b = run(path, await held(path, 'b'));
    await waiting(path, 1);
    await expect(
      setupResources({
        home: path,
        roots: [path],
        shell: 'none',
        lanes: 2,
        dryRun: true,
      })
    ).rejects.toThrow('drain');
    await release(path, 'a');
    await a.done;
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'b');
    await b.done;
  });
  it.each(['SIGKILL', 'SIGHUP'] as const)(
    'gates workload execution until the child receipt is durable and handles %s during receipt',
    async (signal) => {
      const path = await home(1);
      const child = await held(path, 'gated');
      const runner = join(path, 'gate.ts');
      await writeFile(
        runner,
        `import {spawnResourceCommand} from ${JSON.stringify(queueModule)};import {existsSync,writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';process.exitCode=await spawnResourceCommand('node',[${JSON.stringify(child)}],process.env,true,async(pid)=>{writeFileSync(${JSON.stringify(join(path, 'receipt'))},String(pid));while(!existsSync(${JSON.stringify(join(path, 'receipt.release'))}))await setTimeout(10);});`
      );
      const broker = launch(path, [], runner);
      await until(() => exists(join(path, 'receipt')));
      expect(await exists(join(path, 'gated.ready'))).toBe(false);
      await writeFile(join(path, 'receipt.release'), '');
      await until(() => exists(join(path, 'gated.ready')));
      await release(path, 'gated');
      expect((await broker.done).code).toBe(0);
      await rm(join(path, 'gated.ready'));
      await rm(join(path, 'receipt.release'));
      await rm(join(path, 'receipt'));
      const lost = launch(path, [], runner);
      await until(() => exists(join(path, 'receipt')));
      const pid = Number(await readFile(join(path, 'receipt'), 'utf8'));
      lost.child.kill(signal);
      await until(async () => !processGroupAlive(pid));
      if (signal === 'SIGHUP') {
        expect(lost.child.exitCode).toBeNull();
        await writeFile(join(path, 'receipt.release'), '');
        expect((await lost.done).code).toBe(129);
      } else await lost.done;
      expect(await exists(join(path, 'gated.ready'))).toBe(false);
    }
  );
  it('legacy waiters keep both lanes exclusive until the old FIFO drains', async () => {
    const path = await home();
    await mkdir(join(path, 'queue'));
    const legacy = { ...newOwner('legacy') };
    delete legacy.scheduler;
    const ticket = join(path, 'queue', '000-legacy.json');
    await atomicJson(ticket, legacy);
    const a = run(path, await held(path, 'a'));
    await waiting(path, 2);
    expect(await exists(join(path, 'a.ready'))).toBe(false);
    expect((await resourceQueueStatus(path, 2)).owners).toHaveLength(0);
    await expect(
      setupResources({
        home: path,
        roots: [path],
        shell: 'none',
        lanes: 1,
        dryRun: true,
      })
    ).rejects.toThrow('drain');
    // The fixture is the legacy waiter itself, completing its own ticket.
    await rm(ticket);
    await until(() => exists(join(path, 'a.ready')));
    await release(path, 'a');
    await a.done;
  });
  it('surviving grandchildren retain a dead broker lane until their group drains', async () => {
    const path = await home(1);
    const grandchild = await held(path, 'grandchild');
    const source = join(path, 'parent.cjs');
    await writeFile(
      source,
      `const cp=require('child_process');const fs=require('fs');cp.spawn('node',[${JSON.stringify(grandchild)}],{stdio:'ignore'}).unref();const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(path, 'parent.release'))})){clearInterval(t);process.exit(0)}},10);fs.writeFileSync(${JSON.stringify(join(path, 'parent.ready'))},'');`
    );
    const a = run(path, source);
    await until(() => exists(join(path, 'grandchild.ready')));
    await until(async () =>
      Boolean((await resourceQueueStatus(path)).owner?.childPid)
    );
    a.child.kill('SIGKILL');
    await a.done;
    await release(path, 'parent');
    const b = run(path, await held(path, 'b'));
    await waiting(path, 1);
    expect(await exists(join(path, 'b.ready'))).toBe(false);
    await release(path, 'grandchild');
    await until(() => exists(join(path, 'b.ready')));
    await release(path, 'b');
    await b.done;
  });
  it('simultaneous stale-mutex observers cannot exceed two slots', async () => {
    const path = await home();
    await mkdir(join(path, 'admission'));
    await atomicJson(join(path, 'admission', 'owner.json'), {
      ...newOwner('dead'),
      pid: 2147483647,
    });
    const sources = await Promise.all(
      ['a', 'b', 'c'].map((name) => held(path, name))
    );
    const jobs = sources.map((source) => run(path, source));
    await until(async () => {
      const state = await resourceQueueStatus(path, 2);
      return state.owners.length === 2 && state.waiting.length === 1;
    });
    const status = await resourceQueueStatus(path, 2);
    expect(status.owners).toHaveLength(2);
    await until(
      async () =>
        (await readdir(path)).filter((name) => name.endsWith('.ready'))
          .length === 2
    );
    const ready = await readdir(path);
    expect(ready.filter((name) => name.endsWith('.ready'))).toHaveLength(2);
    const active = ready
      .filter((name) => name.endsWith('.ready'))
      .map((name) => name.replace('.ready', ''));
    await release(path, active[0]!);
    await until(
      async () =>
        (await readdir(path)).filter((name) => name.endsWith('.ready'))
          .length === 3
    );
    expect(
      (await resourceQueueStatus(path, 2)).owners.length
    ).toBeLessThanOrEqual(2);
    for (const name of ['a', 'b', 'c']) await release(path, name);
    for (const job of jobs) expect((await job.done).code).toBe(0);
  });
  it('cancels behind an initializing mutex and refuses malformed mutex and mixed occupancy', async () => {
    const path = await home();
    await mkdir(join(path, 'admission'));
    const child = await held(path, 'blocked');
    const brokerRunner = join(path, 'broker-wait.ts');
    await writeFile(
      brokerRunner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};import {writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';const job=queuedResourceCommand(${JSON.stringify(path)},'node',[${JSON.stringify(child)}],process.env,true,2);while(process.listenerCount('SIGTERM')<1)await setTimeout(10);writeFileSync(${JSON.stringify(join(path, 'broker.ready'))},'');process.exitCode=await job;`
    );
    const broker = launch(path, [], brokerRunner);
    await until(() => exists(join(path, 'broker.ready')));
    // An observable signal handler proves the broker reached its mutex wait.
    const runner = join(path, 'mutex-wait.ts');
    await writeFile(
      runner,
      `import {withAdmission} from ${JSON.stringify(resolve('src/cli/resources-slots.ts'))};import {writeFileSync} from 'node:fs';let cancel=false;process.on('SIGTERM',()=>cancel=true);writeFileSync(${JSON.stringify(join(path, 'mutex.ready'))},'');await withAdmission(${JSON.stringify(path)},async()=>{throw new Error('must not enter')},()=>cancel);`
    );
    const waiter = launch(path, [], runner);
    await until(() => exists(join(path, 'mutex.ready')));
    waiter.child.kill('SIGTERM');
    expect((await waiter.done).code).toBe(0);
    broker.child.kill('SIGTERM');
    expect((await broker.done).code).toBe(143);
    await writeFile(join(path, 'admission', 'owner.json'), '{bad');
    expect((await run(path, await held(path, 'malformed')).done).code).toBe(1);
    await mkdir(join(path, 'lock'));
    await mkdir(join(path, 'slots', '0'), { recursive: true });
    const owner = newOwner('fixture');
    await atomicJson(join(path, 'lock', 'owner.json'), owner);
    await atomicJson(join(path, 'slots', '0', 'owner.json'), owner);
    await expect(occupancy(path)).rejects.toThrow('Mixed');
  });
  it('token-checked cleanup cannot remove another slot owner', async () => {
    const path = await home();
    const slot = join(path, 'slots', '0');
    await mkdir(slot, { recursive: true });
    const owner = newOwner('fixture');
    await atomicJson(join(slot, 'owner.json'), owner);
    await releaseSlot(path, slot, 'different-token');
    expect(await ownerState(join(slot, 'owner.json'))).toEqual({
      kind: 'owner',
      owner,
    });
  });
  it('malformed and initializing occupancy fail closed; unknown mutex retains its grace', async () => {
    const path = await home();
    await mkdir(join(path, 'slots', '0'), { recursive: true });
    expect((await occupancy(path, true)).occupied).toHaveLength(1);
    const old = new Date(Date.now() - 31_000);
    await utimes(join(path, 'slots', '0'), old, old);
    expect((await occupancy(path, true)).occupied).toHaveLength(0);
    await mkdir(join(path, 'slots', '0'));
    await writeFile(join(path, 'slots', '0', 'owner.json'), '{bad');
    await expect(occupancy(path, true)).rejects.toThrow('Malformed');
    expect(
      (await ownerState(join(path, 'slots', '0', 'owner.json'))).kind
    ).toBe('invalid');
    await mkdir(join(path, 'admission'));
    let entered = false;
    let cancelled = false;
    const waiting = withAdmission(
      path,
      async () => {
        entered = true;
      },
      () => cancelled
    );
    await until(
      async () => (await readdir(join(path, 'admission'))).length === 0
    );
    cancelled = true;
    await waiting;
    expect(entered).toBe(false);
  });
});
