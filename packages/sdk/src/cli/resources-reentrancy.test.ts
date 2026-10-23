import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  idleFor,
  nextActivity,
  ownerCpu,
  parseCpuTime,
  parseProcessCpu,
} from './resources-activity';
import { isTrivialCommand } from './resources-command';
import { atomicJson, readResourceConfig } from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import { nestedOwner, newOwner } from './resources-slots';
import {
  renderResourceStatus,
  resourceStatusDetails,
} from './resources-status';
import {
  bun,
  entry,
  exists,
  privateFixtures,
  processTimeout,
  realNode,
  until,
} from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const fixtures = privateFixtures(true);
const { home, held, launch, waiting, release, script } = fixtures;
const queueModule = resolve('src/cli/resources-queue.ts');
const run = (path: string, source: string, env: NodeJS.ProcessEnv = {}) =>
  launch(path, ['run', '--', 'node', source], path, entry, env);
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
afterEach(() => fixtures.cleanup());

describe('nested admission', { timeout: 45_000 }, () => {
  it('passes a nested ttr resources run straight through with the admitted marker', async () => {
    const path = await home(1);
    const inner = join(path, 'inner.json');
    const code = `require('fs').writeFileSync(${JSON.stringify(inner)},JSON.stringify({marker:process.env.TTR_RESOURCES_ADMITTED}))`;
    const outer = await script(
      path,
      'outer',
      `const fs=require('fs');fs.writeFileSync(${JSON.stringify(join(path, 'outer.json'))},JSON.stringify({marker:process.env.TTR_RESOURCES_ADMITTED}));require('child_process').execFileSync(${JSON.stringify(bun)},[${JSON.stringify(join(path, 'fixture-shim.ts'))},'run','--','node','-e',${JSON.stringify(code)}],{stdio:'inherit',timeout:${processTimeout}});`
    );
    const result = await run(path, outer).done;
    expect(result.code, result.err).toBe(0);
    const { marker } = await json(join(path, 'outer.json'));
    expect(marker).toMatch(/^[0-9a-f-]{36}$/);
    expect((await json(inner)).marker).toBe(marker);
    // Only the outer job claimed a lane.
    expect(result.err.match(/\[ttr resources\] running PID/g)).toHaveLength(1);
  });

  it('runs a heavy shim inside an admitted job while an unrelated waiter is queued ahead', async () => {
    const path = await home(1);
    await mkdir(join(path, 'scripts'));
    const check = join(path, 'scripts', 'check.js');
    await writeFile(
      check,
      `require('fs').writeFileSync(${JSON.stringify(join(path, 'shim.json'))},JSON.stringify({marker:process.env.TTR_RESOURCES_ADMITTED,vitest:process.env.VITEST_MAX_WORKERS}))`
    );
    const go = join(path, 'go');
    const outer = await script(
      path,
      'outer',
      `const fs=require('fs');fs.writeFileSync(${JSON.stringify(join(path, 'outer.ready'))},'');const t=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(go)}))return;clearInterval(t);require('child_process').execFileSync(${JSON.stringify(join(path, 'bin', 'node'))},[${JSON.stringify(check)}],{stdio:'inherit',timeout:${processTimeout}});},20);`
    );
    const parent = run(path, outer);
    await until(() => exists(join(path, 'outer.ready')));
    const sibling = launch(path, ['run', '--', 'node', '-e', '0']);
    await waiting(path, 1);
    await writeFile(go, '');
    const result = await parent.done;
    expect(result.code, result.err).toBe(0);
    // One base lane owns the whole two-worker budget; the shim inherits it.
    expect(await json(join(path, 'shim.json'))).toMatchObject({ vitest: '2' });
    expect((await json(join(path, 'shim.json'))).marker).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect((await sibling.done).code).toBe(0);
  });

  it('safety net admits a waiter whose first ancestry probe failed', async () => {
    const path = await home(1);
    const output = join(path, 'net.txt');
    const runner = join(path, 'net.ts');
    await writeFile(
      runner,
      `import {mock} from 'bun:test';import * as cp from 'node:child_process';
      let failures=2;const original=cp.execFileSync;
      mock.module('node:child_process',()=>({...cp,execFileSync:(command,args,options)=>{if(command==='ps'&&args?.[1]==='pid=,ppid=,pgid='&&failures-->0)throw new Error('ps unavailable');return original(command,args,options)}}));
      delete process.env.TTR_RESOURCES_ADMITTED;delete process.env.TTR_RESOURCE_OWNER;
      const {queuedResourceCommand}=await import(${JSON.stringify(queueModule)});
      process.exitCode=await queuedResourceCommand(${JSON.stringify(path)},${JSON.stringify(realNode)},['-e',${JSON.stringify(`require('fs').writeFileSync(${JSON.stringify(output)},'ok')`)}],process.env,true,1);`
    );
    const result = await launch(path, ['run', '--', 'bun', runner]).done;
    expect(result.code, result.err).toBe(0);
    expect(await readFile(output, 'utf8')).toBe('ok');
    expect(result.err).toContain('descends from admitted PID');
  });

  it('detects a live ancestor owner without any marker', async () => {
    const path = await home(1);
    await atomicJson(join(path, 'slots', '0', 'owner.json'), {
      ...newOwner('ancestor'),
      pid: process.ppid,
    });
    expect((await nestedOwner(path, {}))?.tool).toBe('ancestor');
    const unrelated = spawn('sleep', ['30'], { stdio: 'ignore' });
    try {
      await atomicJson(join(path, 'slots', '0', 'owner.json'), {
        ...newOwner('sibling'),
        pid: unrelated.pid,
      });
      expect(await nestedOwner(path, {})).toBeUndefined();
    } finally {
      unrelated.kill();
    }
  });

  it('rejects stale and copied markers so unrelated jobs keep queueing FIFO', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const { token } = await json(join(path, 'slots', '0', 'owner.json'));
    const copied = launch(path, ['run', '--', 'node', '-e', '0'], path, entry, {
      TTR_RESOURCES_ADMITTED: token,
    });
    await waiting(path, 1);
    const stale = launch(path, ['run', '--', 'node', '-e', '0'], path, entry, {
      TTR_RESOURCES_ADMITTED: 'stale-token',
    });
    await waiting(path, 2);
    expect([copied.child.exitCode, stale.child.exitCode]).toEqual([null, null]);
    await release(path, 'a');
    expect((await a.done).code).toBe(0);
    expect((await copied.done).code).toBe(0);
    const late = await stale.done;
    expect(late.code).toBe(0);
    expect(late.err).toContain('ignoring TTR_RESOURCES_ADMITTED');
  });
});

describe('parallelism hygiene', { timeout: 45_000 }, () => {
  it('classifies version, help and read-only commands as trivial', () => {
    for (const [name, args] of [
      ['bun', ['--version']],
      ['node', ['-v']],
      ['flutter', ['--help']],
      ['ls', ['-la']],
      ['git', ['status', '--short']],
      ['git', ['rev-parse', 'HEAD']],
    ] as const)
      expect(isTrivialCommand(name, [...args]), name).toBe(true);
    for (const [name, args] of [
      ['bun', ['run', 'test']],
      ['python3', ['script.py']],
      ['bun', ['--version', 'test']],
      ['git', ['-C', '/elsewhere', 'status']],
      ['git', ['commit']],
      ['sh', ['-c', 'ls']],
    ] as const)
      expect(isTrivialCommand(name, [...args]), name).toBe(false);
  });

  it('runs trivial commands immediately while every lane is busy', async () => {
    const path = await home(1);
    const a = run(path, await held(path, 'a'));
    await until(() => exists(join(path, 'a.ready')));
    const probe = await launch(path, ['run', '--', 'node', '--version']).done;
    expect(probe.code, probe.err).toBe(0);
    expect(probe.out).toMatch(/^v\d+/);
    expect((await resourceQueueStatus(path)).waiting).toHaveLength(0);
    await release(path, 'a');
    await a.done;
  });

  it('keeps shims working for out-of-range lanes and fails open on invalid fields', async () => {
    const path = await home(1);
    const config = (await readResourceConfig(path))!;
    const shim = (env: NodeJS.ProcessEnv = {}) =>
      launch(
        path,
        ['shim', 'node', '--', '-e', 'console.log(42)'],
        path,
        entry,
        env
      ).done;
    await atomicJson(join(path, 'config.json'), {
      ...config,
      validationLanes: 3,
      maxValidationLanes: 12,
    });
    const clamped = await shim();
    expect(clamped.code, clamped.err).toBe(0);
    expect(clamped.out.trim()).toBe('42');
    expect(clamped.err).toContain(
      'maxValidationLanes must be an integer from 1 to 8; using 8.'
    );
    await atomicJson(join(path, 'config.json'), { ...config, enabled: 'yes' });
    const open = await shim();
    expect(open.code, open.err).toBe(0);
    expect(open.out.trim()).toBe('42');
    expect(open.err).toContain('enabled must be true or false');
    expect(open.err).toContain('without resource admission');
    const strict = await launch(path, ['run', '--', 'node', '-e', '0']).done;
    expect(strict.code).toBe(1);
    expect(strict.err).toContain('enabled must be true or false');
  });
});

describe('owner activity and status', () => {
  it('parses ps CPU time and accounts for descendants that left the group', () => {
    expect(parseCpuTime('0:01.50')).toBe(1.5);
    expect(parseCpuTime('125:00.00')).toBe(7500);
    expect(parseCpuTime('01:02:03')).toBe(3723);
    expect(parseCpuTime('2-00:00:01')).toBe(172_801);
    const table = parseProcessCpu(
      [
        ' 100 1 100 0.0 0:00.10',
        ' 200 100 200 0.0 0:01.00',
        ' 300 200 300 12.5 1:00.00',
        ' 400 1 400 50.0 9:00.00',
      ].join('\n')
    );
    const owner = { ...newOwner('fixture'), pid: 50, childPid: 200 };
    expect(ownerCpu(owner, table)).toEqual({
      percent: 12.5,
      seconds: 61,
      processes: 2,
    });
  });

  it('tracks the last active sample and flags only long idle owners', () => {
    const start = new Date('2026-10-23T00:00:00Z');
    const later = (minutes: number) =>
      new Date(start.getTime() + minutes * 60_000);
    const first = nextActivity('t', 10, undefined, start);
    const busy = nextActivity('t', 20, first, later(5));
    const quiet = nextActivity('t', 20.1, busy, later(20));
    expect([first.lastActiveAt, busy.lastActiveAt, quiet.lastActiveAt]).toEqual(
      [start.toISOString(), later(5).toISOString(), later(5).toISOString()]
    );
    const owner = { ...newOwner('fixture'), startedAt: start.toISOString() };
    const now = later(20).getTime();
    expect(idleFor(owner, quiet, { percent: 0, seconds: 20 }, now)).toBe(
      15 * 60_000
    );
    expect(idleFor(owner, quiet, { percent: 3, seconds: 20 }, now)).toBe(0);
    expect(idleFor(owner, undefined, { percent: 0, seconds: 0 }, now)).toBe(
      20 * 60_000
    );
    expect(idleFor(owner, undefined, { percent: 0, seconds: 9 }, now)).toBe(0);
  });

  it('reports owner command, age, CPU and an idle warning without signalling', async () => {
    const path = await home(1);
    const slot = join(path, 'slots', '0');
    const idle = spawn('sleep', ['60'], { stdio: 'ignore', detached: true });
    try {
      const started = new Date(Date.now() - 12 * 60_000).toISOString();
      const owner = {
        ...newOwner('python3', 'python3 /tmp/check.py'),
        childPid: idle.pid,
        startedAt: started,
      };
      await atomicJson(join(slot, 'owner.json'), owner);
      await atomicJson(join(slot, 'activity.json'), {
        token: owner.token,
        cpuSeconds: 0,
        sampledAt: new Date().toISOString(),
        lastActiveAt: started,
      });
      const state = await resourceQueueStatus(path);
      const details = await resourceStatusDetails(state);
      expect(details.ownerDetails[0]).toMatchObject({
        pid: owner.pid,
        childPid: idle.pid,
        command: 'python3 /tmp/check.py',
        cpuPercent: 0,
      });
      expect(details.ownerDetails[0]!.elapsedSeconds).toBeGreaterThanOrEqual(
        12 * 60
      );
      expect(details.warnings).toHaveLength(1);
      expect(details.warnings[0]).toContain('idle at 0% CPU for 12m');
      const text = renderResourceStatus({
        enabled: true,
        machine: { memoryGiB: 24, cpus: 10 },
        limits: { turboConcurrency: 1, vitestWorkers: 2 },
        ...state,
        ...details,
      });
      expect(text).toContain('python3 /tmp/check.py');
      expect(text).toContain('WARNING: Owner PID');
      expect(idle.exitCode).toBeNull();
    } finally {
      idle.kill();
    }
  });
});
