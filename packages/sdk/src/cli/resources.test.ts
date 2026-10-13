import { type ChildProcess, spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commandCwd,
  isHeavyCommand,
  limitCommand,
  realExecutable,
} from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  readResourceConfig,
  repositoryIdentity,
  resourceScope,
} from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import {
  installResourceShims,
  removeResourceHook,
  setupResources,
  stableResourceEntry,
  uninstallResources,
} from './resources-setup';

const entry = resolve('src/cli/resources-entry.ts');
const bun = realExecutable('bun', '/nonexistent-shim-dir');
const realNode = realExecutable('node', '/nonexistent');
const fixturePath = [dirname(realNode), dirname(bun), '/usr/bin', '/bin'].join(
  delimiter
);
const children: ChildProcess[] = [];
const dirs: string[] = [];
// These integration tests start multiple runtimes and real process groups.
// Hosted runners can spend several seconds scheduling each child under load.
const processTimeout = 15_000;
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), 'ttr-resources-'));
  dirs.push(path);
  return path;
}
function launch(
  home: string,
  args: string[],
  cwd?: string,
  executableEntry = entry
) {
  const cliArgs =
    args[0] === 'run' ? ['run', '--ignore-pressure', ...args.slice(1)] : args;
  const child = spawn(bun, [executableEntry, ...cliArgs], {
    cwd,
    env: { ...process.env, PATH: fixturePath, TTR_RESOURCES_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let out = '';
  let err = '';
  child.stdout?.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    err += chunk;
  });
  const done = new Promise<{ code: number | null; out: string; err: string }>(
    (resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => resolve({ code, out, err }));
    }
  );
  return { child, done };
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + processTimeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for resource fixture.');
}
const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false
  );
async function script(home: string, name: string, text: string) {
  const path = join(home, `${name}.cjs`);
  await writeFile(path, text);
  return path;
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('resource policy', () => {
  it('adapts worker counts and retains host headroom', () => {
    expect(defaultResourceConfig(24 * 1024 ** 3, 10).vitestWorkers).toBe(2);
    expect(defaultResourceConfig(8 * 1024 ** 3, 2).vitestWorkers).toBe(1);
    expect(defaultResourceConfig(128 * 1024 ** 3, 32).vitestWorkers).toBe(4);
  });
  it('recognizes package, direct-tool and script invocations', () => {
    for (const [name, args] of [
      ['bun', ['--cwd', 'apps/ai', 'run', 'build']],
      ['node', ['/repo/node_modules/.bin/turbo', 'run', 'test']],
      ['node', ['/repo/node_modules/vitest/vitest.mjs', 'run']],
      ['node', ['scripts/check.js']],
      ['playwright', ['test']],
      ['supabase', ['db', 'reset']],
    ] as const)
      expect(isHeavyCommand(name, [...args])).toBe(true);
    for (const [name, args] of [
      ['bun', ['--version']],
      ['bun', ['git-sync']],
      ['node', ['-e', 'test']],
      ['turbo', ['run', 'dev']],
      ['turbo', ['run', 'test', '--dry=json']],
      ['playwright', ['test', '--list']],
    ] as const)
      expect(isHeavyCommand(name, [...args])).toBe(false);
    expect(commandCwd(['--cwd', 'apps/ai', 'build'], '/repo')).toBe(
      '/repo/apps/ai'
    );
  });
  it('clamps Turbo task flags without changing arguments after the separator', () => {
    expect(
      limitCommand(
        'turbo',
        [
          'run',
          'test',
          '--parallel',
          '--concurrency',
          '10',
          '--',
          '--concurrency=8',
        ],
        defaultResourceConfig()
      )
    ).toEqual(['run', 'test', '--concurrency=1', '--', '--concurrency=8']);
  });
  it('includes linked worktrees and excludes similar directory prefixes', async () => {
    const home = await temporary();
    const main = join(home, 'main');
    const linked = join(home, 'linked');
    const common = join(main, '.git');
    await mkdir(join(common, 'worktrees', 'linked'), { recursive: true });
    await mkdir(linked);
    await writeFile(
      join(linked, '.git'),
      `gitdir: ${join(common, 'worktrees', 'linked')}\n`
    );
    await writeFile(
      join(common, 'worktrees', 'linked', 'commondir'),
      '../..\n'
    );
    const config = {
      ...defaultResourceConfig(),
      roots: [main],
      repositories: [repositoryIdentity(main)!],
    };
    expect(resourceScope(config, linked)).toBe(true);
    expect(resourceScope(config, `${main}-other`)).toBe(false);
  });
  it('supports idempotent installation and removes only its own hooks', async () => {
    const home = await temporary();
    const options = { home, roots: [home], shell: 'none', workers: 2 };
    await setupResources(options);
    await setupResources(options);
    const config = JSON.parse(
      await readFile(join(home, 'config.json'), 'utf8')
    );
    expect(config.roots).toHaveLength(1);
    const before =
      'export CUSTOM=1\n# >>> ttr resources >>>\nexport PATH=test\n# <<< ttr resources <<<\nexport AFTER=2\n';
    expect(removeResourceHook(before)).toBe(
      'export CUSTOM=1\nexport AFTER=2\n'
    );
    await uninstallResources(home);
    expect(await exists(join(home, 'bin', 'bun'))).toBe(false);
    expect(
      JSON.parse(await readFile(join(home, 'config.json'), 'utf8')).enabled
    ).toBe(false);
  });
  it.each(['.bun', '.pnpm'])(
    'survives a %s package upgrade and removal of the old version',
    async (store) => {
      const home = await temporary();
      const modules = join(home, 'node_modules');
      const oldPackage = join(
        modules,
        store,
        'tuturuuu@old/node_modules/tuturuuu'
      );
      const nextPackage = join(
        modules,
        store,
        'tuturuuu@next/node_modules/tuturuuu'
      );
      for (const [path, version] of [
        [oldPackage, 'old-runtime'],
        [nextPackage, 'new-runtime'],
      ]) {
        await mkdir(join(path!, 'dist/cli'), { recursive: true });
        await writeFile(
          join(path!, 'dist/cli/resources-entry.js'),
          `process.stdout.write(${JSON.stringify(version)});`
        );
      }
      const alias = join(modules, 'tuturuuu');
      await symlink(oldPackage, alias, 'dir');
      const oldEntry = join(oldPackage, 'dist/cli/resources-entry.js');
      const stableEntry = join(alias, 'dist/cli/resources-entry.js');
      expect(stableResourceEntry(oldEntry)).toBe(stableEntry);
      const bin = await installResourceShims(join(home, 'controls'), oldEntry);
      await rm(alias);
      await symlink(nextPackage, alias, 'dir');
      expect(stableResourceEntry(oldEntry)).toBe(oldEntry);
      await rm(oldPackage, { recursive: true });
      const child = spawn(join(bin, 'bun'), ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      const code = await new Promise((resolve, reject) => {
        child.once('exit', resolve);
        child.once('error', reject);
      });
      expect(code).toBe(0);
      expect(output).toBe('new-runtime');
    }
  );
});

describe('resource admission', { timeout: 45_000 }, () => {
  it('serializes jobs across checkouts and preserves their exit codes', async () => {
    const home = await temporary();
    const a = join(home, 'a');
    const b = join(home, 'b');
    await mkdir(a);
    await mkdir(b);
    const ready = join(home, 'ready');
    const release = join(home, 'release');
    const second = join(home, 'second');
    const firstScript = await script(
      home,
      'first',
      `const fs=require('fs');fs.writeFileSync(${JSON.stringify(ready)},'');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(t)}},25);`
    );
    const nextScript = await script(
      home,
      'next',
      `require('fs').writeFileSync(${JSON.stringify(second)},'');process.exit(7);`
    );
    const first = launch(home, ['run', '--', 'node', firstScript], a);
    await until(() => exists(ready));
    const next = launch(home, ['run', '--', 'node', nextScript], b);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await exists(second)).toBe(false);
    await writeFile(release, '');
    expect((await first.done).code).toBe(0);
    expect((await next.done).code).toBe(7);
  });
  it('installed shims restore limits after environment filtering and leave other projects unchanged', async () => {
    const home = await temporary();
    const project = join(home, 'project');
    const outside = join(home, 'outside');
    await mkdir(project);
    await mkdir(outside);
    const installed = await launch(home, [
      'setup',
      '--root',
      project,
      '--shell',
      'none',
      '--workers',
      '2',
    ]).done;
    expect(installed.code, installed.err).toBe(0);
    const inspect = async (cwd: string) => {
      const child = spawn(
        join(home, 'bin', 'node'),
        ['-e', 'console.log(process.env.VITEST_MAX_WORKERS || "unset")'],
        {
          cwd,
          env: { PATH: fixturePath },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      children.push(child);
      let output = '';
      let error = '';
      child.stdout?.on('data', (data) => {
        output += data;
      });
      child.stderr?.on('data', (data) => {
        error += data;
      });
      const code = await new Promise((resolve) => child.once('exit', resolve));
      expect(code, error).toBe(0);
      return output.trim();
    };
    expect(await inspect(project)).toBe('2');
    expect(await inspect(outside)).toBe('unset');
  });
  it('preserves worker limits through real Turbo strict env without prior setup', async () => {
    const home = await temporary();
    const fixture = join(home, 'repo');
    const pkg = join(fixture, 'packages', 'probe');
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(fixture, 'package.json'),
      JSON.stringify({
        name: 'resource-fixture',
        private: true,
        packageManager: 'bun@1.4.1',
        workspaces: ['packages/*'],
      })
    );
    await writeFile(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'resource-probe',
        scripts: { test: 'node probe.cjs' },
      })
    );
    await writeFile(
      join(pkg, 'probe.cjs'),
      `console.log("WORKERS=" + process.env.VITEST_MAX_WORKERS); if (process.env.VITEST_MAX_WORKERS !== "${defaultResourceConfig().vitestWorkers}") process.exit(9);`
    );
    await writeFile(
      join(fixture, 'turbo.json'),
      JSON.stringify({ tasks: { test: { cache: false } } })
    );
    const install = spawn(bun, ['install', '--ignore-scripts'], {
      cwd: fixture,
      stdio: 'ignore',
    });
    children.push(install);
    expect(await new Promise((resolve) => install.once('exit', resolve))).toBe(
      0
    );
    const turbo = resolve('../../node_modules/.bin/turbo');
    const result = await launch(
      home,
      [
        'run',
        '--',
        turbo,
        'run',
        'test',
        '--env-mode=strict',
        '--concurrency=8',
      ],
      fixture
    ).done;
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain(
      `WORKERS=${defaultResourceConfig().vitestWorkers}`
    );
  }, 45_000);
  it('does not deadlock nested commands after an environment marker is removed', async () => {
    const home = await temporary();
    const source = await script(
      home,
      'nested',
      `delete process.env.TTR_RESOURCE_OWNER;require('child_process').execFileSync(${JSON.stringify(bun)},[${JSON.stringify(entry)},'run','--','node','-e','console.log(42)'],{stdio:'inherit',timeout:${processTimeout}});`
    );
    const result = await launch(home, ['run', '--', 'node', source]).done;
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain('42');
  });
  it('cancels a running process group and releases the slot', async () => {
    const home = await temporary();
    const ready = join(home, 'ready');
    const source = await script(
      home,
      'long',
      `require('fs').writeFileSync(${JSON.stringify(ready)},'');setTimeout(()=>{},60000);`
    );
    const first = launch(home, ['run', '--', 'node', source]);
    await until(() => exists(ready));
    const next = launch(home, ['run', '--', 'node', '-e', 'console.log(1)']);
    first.child.kill('SIGTERM');
    expect((await first.done).code).toBe(143);
    expect((await next.done).code).toBe(0);
  });
  it('keeps the slot while a child survives its abruptly killed supervisor', async () => {
    const home = await temporary();
    const ready = join(home, 'ready');
    const release = join(home, 'release');
    const source = await script(
      home,
      'survivor',
      `const fs=require('fs');fs.writeFileSync(${JSON.stringify(ready)},'');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(t)}},25);`
    );
    const first = launch(home, ['run', '--', 'node', source]);
    await until(() => exists(ready));
    await until(async () =>
      Boolean(
        JSON.parse(
          await readFile(join(home, 'slots', '0', 'owner.json'), 'utf8')
        ).childPid
      )
    );
    first.child.kill('SIGKILL');
    await first.done;
    const next = launch(home, ['run', '--', 'node', '-e', 'console.log(2)']);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(next.child.exitCode).toBeNull();
    await writeFile(release, '');
    expect((await next.done).code).toBe(0);
  });
});

// These probes are lightweight executables named for classified tools. They
// inspect actual argv/env and durable owner caps without running those tools.
async function workerProbe(
  home: string,
  tool: 'vitest' | 'cargo',
  name = 'probe'
) {
  const path = join(home, tool);
  await writeFile(
    path,
    `#!${realNode}
const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(home, `${name}.json`))},JSON.stringify({args:process.argv.slice(2),vitest:process.env.VITEST_MAX_WORKERS,cargo:process.env.CARGO_BUILD_JOBS,turbo:process.env.TURBO_CONCURRENCY}));const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(home, `${name}.release`))})){clearInterval(timer)}},10);`
  );
  await chmod(path, 0o700);
  return path;
}
const queueModule = resolve('src/cli/resources-queue.ts');
const configModule = resolve('src/cli/resources-config.ts');
async function workerHome() {
  const home = await temporary();
  await atomicJson(join(home, 'config.json'), {
    ...defaultResourceConfig(),
    roots: [home],
    validationLanes: 1,
    vitestWorkers: 2,
    buildJobs: 2,
  });
  return home;
}
describe('reviewed resource policy and signals', { timeout: 45_000 }, () => {
  it('rejects busy same-lane budget changes and binds actual argv/env to recorded caps', async () => {
    const home = await workerHome();
    const ready = join(home, 'ready');
    const release = join(home, 'release');
    const active = launch(home, [
      'run',
      '--',
      'node',
      await script(
        home,
        'active',
        `const fs=require('fs');fs.writeFileSync(${JSON.stringify(ready)},'');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))clearInterval(timer)},10);`
      ),
    ]);
    await until(() => exists(ready));
    const probe = await workerProbe(home, 'vitest');
    const queued = launch(home, ['run', '--', probe, 'run', '--maxWorkers=16']);
    await until(
      async () => (await resourceQueueStatus(home)).waiting.length === 1
    );
    const before = await readFile(join(home, 'config.json'), 'utf8');
    const change = await launch(home, [
      'setup',
      '--shell',
      'none',
      '--workers',
      '1',
    ]).done;
    expect(change.code).toBe(1);
    expect(change.err).toContain('worker budgets');
    expect(await readFile(join(home, 'config.json'), 'utf8')).toBe(before);
    await writeFile(release, '');
    await active.done;
    await until(() => exists(join(home, 'probe.json')));
    expect(
      JSON.parse(await readFile(join(home, 'probe.json'), 'utf8'))
    ).toEqual({
      args: ['run', '--maxWorkers=2'],
      vitest: '2',
      cargo: '2',
      turbo: '1',
    });
    expect((await resourceQueueStatus(home)).owner?.limits).toEqual({
      vitestWorkers: 2,
      buildJobs: 2,
    });
    await writeFile(join(home, 'probe.release'), '');
    expect((await queued.done).code).toBe(0);
  });
  it('rejects worker changes for a live pressure-held waiter even with zero owners', async () => {
    const home = await workerHome();
    const runner = join(home, 'waiter.ts');
    await writeFile(
      runner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};import {writeFileSync} from 'node:fs';process.exitCode=await queuedResourceCommand(${JSON.stringify(home)},'node',['-e','process.exit(9)'],process.env,false,1,async()=>{writeFileSync(${JSON.stringify(join(home, 'pressure.ready'))},'');return {blocked:true,reason:'private fixture'};});`
    );
    const waiter = launch(home, [], undefined, runner);
    await until(() => exists(join(home, 'pressure.ready')));
    expect((await resourceQueueStatus(home)).owners).toHaveLength(0);
    const before = await readFile(join(home, 'config.json'), 'utf8');
    await expect(
      setupResources({ home, roots: [home], shell: 'none', workers: 1 })
    ).rejects.toThrow('worker budgets');
    expect(await readFile(join(home, 'config.json'), 'utf8')).toBe(before);
    waiter.child.kill('SIGTERM');
    expect((await waiter.done).code).toBe(143);
  });
  it('re-caps stale explicit flags across the initial-read to ticket-publication race', async () => {
    const home = await workerHome();
    const probe = await workerProbe(home, 'cargo');
    const runner = join(home, 'race.ts');
    await writeFile(
      runner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};import {readResourceConfig,laneResourceConfig,resourceEnvironment} from ${JSON.stringify(configModule)};import {limitCommand} from ${JSON.stringify(resolve('src/cli/resources-command.ts'))};import {existsSync,writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';const config=laneResourceConfig(await readResourceConfig(${JSON.stringify(home)}));const args=limitCommand('cargo',['test','--jobs=16'],config);writeFileSync(${JSON.stringify(join(home, 'initial.json'))},JSON.stringify(args));while(!existsSync(${JSON.stringify(join(home, 'initial.release'))}))await setTimeout(10);process.exitCode=await queuedResourceCommand(${JSON.stringify(home)},${JSON.stringify(probe)},args,resourceEnvironment(config),true,1);`
    );
    const broker = launch(home, [], undefined, runner);
    await until(() => exists(join(home, 'initial.json')));
    expect(
      JSON.parse(await readFile(join(home, 'initial.json'), 'utf8'))
    ).toEqual(['test', '--jobs=2']);
    expect((await resourceQueueStatus(home)).waiting).toHaveLength(0);
    await setupResources({ home, roots: [home], shell: 'none', workers: 1 });
    await writeFile(join(home, 'initial.release'), '');
    await until(() => exists(join(home, 'probe.json')));
    expect(
      JSON.parse(await readFile(join(home, 'probe.json'), 'utf8'))
    ).toEqual({
      args: ['test', '--jobs=1'],
      vitest: '1',
      cargo: '1',
      turbo: '1',
    });
    expect((await resourceQueueStatus(home)).owner?.limits).toEqual({
      vitestWorkers: 1,
      buildJobs: 1,
    });
    await writeFile(join(home, 'probe.release'), '');
    expect((await broker.done).code).toBe(0);
  });
  it('rejects a full budget-policy change during pressure probing before any launch', async () => {
    const home = await workerHome();
    const probe = await workerProbe(home, 'vitest');
    const runner = join(home, 'pressure-race.ts');
    await writeFile(
      runner,
      `import {queuedResourceCommand} from ${JSON.stringify(queueModule)};import {existsSync,writeFileSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';try{process.exitCode=await queuedResourceCommand(${JSON.stringify(home)},${JSON.stringify(probe)},['run','--maxWorkers=16'],process.env,false,1,async()=>{writeFileSync(${JSON.stringify(join(home, 'pressure.ready'))},'');while(!existsSync(${JSON.stringify(join(home, 'pressure.release'))}))await setTimeout(10);return {blocked:false,reason:null};});}catch(error){console.error(error.message);process.exitCode=1;}`
    );
    const broker = launch(home, [], undefined, runner);
    await until(() => exists(join(home, 'pressure.ready')));
    // Deliberately mutate only synthetic data to model an out-of-protocol writer.
    await atomicJson(join(home, 'config.json'), {
      ...(await readResourceConfig(home)),
      vitestWorkers: 1,
      buildJobs: 1,
    });
    await writeFile(join(home, 'pressure.release'), '');
    const result = await broker.done;
    expect(result.code).toBe(1);
    expect(result.err).toContain('worker policy changed');
    expect(await exists(join(home, 'probe.json'))).toBe(false);
    expect((await resourceQueueStatus(home)).owners).toHaveLength(0);
  });
  it('preserves owned SIGHUP identity and exit129 after child drain', async () => {
    const home = await workerHome();
    const child = await script(
      home,
      'hup',
      `const fs=require('fs');process.on('SIGHUP',()=>fs.writeFileSync(${JSON.stringify(join(home, 'signal'))},'SIGHUP'));process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(join(home, 'signal'))},'SIGTERM'));fs.writeFileSync(${JSON.stringify(join(home, 'ready'))},'');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(home, 'release'))})){clearInterval(timer);process.exit(0)}},10);`
    );
    const broker = launch(home, ['run', '--', 'node', child]);
    await until(() => exists(join(home, 'ready')));
    broker.child.kill('SIGHUP');
    await until(() => exists(join(home, 'signal')));
    expect(await readFile(join(home, 'signal'), 'utf8')).toBe('SIGHUP');
    expect(broker.child.exitCode).toBeNull();
    expect((await resourceQueueStatus(home)).owners).toHaveLength(1);
    await writeFile(join(home, 'release'), '');
    expect((await broker.done).code).toBe(129);
    expect((await resourceQueueStatus(home)).owners).toHaveLength(0);
  });
});

it.each(['enable', 'disable', 'uninstall'] as const)(
  'serializes %s config reads with setup and preserves admitted budgets',
  async (action) => {
    const home = await workerHome();
    const extra = join(home, 'extra');
    await mkdir(extra);
    const repo = join(home, 'repository.git');
    await atomicJson(join(home, 'config.json'), {
      ...(await readResourceConfig(home)),
      repositories: [repo],
    });
    const readerFile = join(home, 'reader.ts');
    // Delay a real filesystem read in this private process, not the scheduler.
    await writeFile(
      readerFile,
      `import {mock} from 'bun:test';import * as fs from 'node:fs/promises';import {existsSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';const original=fs.readFile;let paused=false;mock.module('node:fs/promises',()=>({...fs,readFile:async(path,...args)=>{const value=await original(path,...args);if(String(path)===${JSON.stringify(join(home, 'config.json'))}&&!paused){paused=true;await fs.writeFile(${JSON.stringify(join(home, 'read.ready'))},'');while(!existsSync(${JSON.stringify(join(home, 'read.release'))}))await setTimeout(10);}return value;}}));const {runResourcesCommand}=await import(${JSON.stringify(resolve('src/cli/resources.ts'))});await runResourcesCommand([${JSON.stringify(action)}]);`
    );
    const reader = launch(home, [], undefined, readerFile);
    await until(() => exists(join(home, 'read.ready')));
    expect(
      JSON.parse(await readFile(join(home, 'admission', 'owner.json'), 'utf8'))
        .pid
    ).toBe(reader.child.pid);
    const setupFile = join(home, 'setup.ts');
    await writeFile(
      setupFile,
      `import {setupResources} from ${JSON.stringify(resolve('src/cli/resources-setup.ts'))};import {writeFileSync} from 'node:fs';const result=setupResources({home:${JSON.stringify(home)},roots:[${JSON.stringify(extra)}],shell:'none',workers:2,lanes:2});writeFileSync(${JSON.stringify(join(home, 'setup.ready'))},'');await result;writeFileSync(${JSON.stringify(join(home, 'setup.done'))},'');`
    );
    const setup = launch(home, [], undefined, setupFile);
    await until(() => exists(join(home, 'setup.ready')));
    expect(await exists(join(home, 'setup.done'))).toBe(false);
    expect((await readResourceConfig(home))?.validationLanes).toBe(1);
    await writeFile(join(home, 'read.release'), '');
    expect((await reader.done).code).toBe(0);
    expect((await setup.done).code).toBe(0);
    const policy = await readResourceConfig(home);
    expect(policy?.validationLanes).toBe(2);
    expect(policy?.repositories).toEqual([repo]);
    expect(policy?.roots).toHaveLength(2);
    const a = launch(home, [
      'run',
      '--',
      await workerProbe(home, 'vitest', 'a'),
      'run',
      '--maxWorkers=16',
    ]);
    await until(() => exists(join(home, 'a.json')));
    const toggle = await launch(home, [action]).done;
    expect(toggle.code).toBe(action === 'uninstall' ? 1 : 0);
    const current = await readResourceConfig(home);
    expect(current).toEqual({ ...policy, enabled: action === 'enable' });
    if (action === 'uninstall') {
      expect(toggle.err).toContain('Wait for queued/running jobs');
      expect(await exists(join(home, 'bin', 'node'))).toBe(true);
    }
    const b = launch(home, [
      'run',
      '--',
      await workerProbe(home, 'cargo', 'b'),
      'test',
      '--jobs=16',
    ]);
    await until(() => exists(join(home, 'b.json')));
    const owners = (await resourceQueueStatus(home, 2)).owners;
    expect(owners.map((owner) => owner.limits)).toEqual([
      { vitestWorkers: 1, buildJobs: 1 },
      { vitestWorkers: 1, buildJobs: 1 },
    ]);
    for (const [name, flag] of [
      ['a', '--maxWorkers=1'],
      ['b', '--jobs=1'],
    ]) {
      const probe = JSON.parse(
        await readFile(join(home, `${name}.json`), 'utf8')
      );
      expect([probe.args[1], probe.vitest, probe.cargo, probe.turbo]).toEqual([
        flag,
        '1',
        '1',
        '1',
      ]);
      await writeFile(join(home, `${name}.release`), '');
    }
    expect((await a.done).code).toBe(0);
    expect((await b.done).code).toBe(0);
  }
);
