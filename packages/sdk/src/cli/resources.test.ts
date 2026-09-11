import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commandCwd,
  isHeavyCommand,
  limitCommand,
  realExecutable,
} from './resources-command';
import {
  defaultResourceConfig,
  repositoryIdentity,
  resourceScope,
} from './resources-config';
import {
  removeResourceHook,
  setupResources,
  uninstallResources,
} from './resources-setup';

const entry = resolve('src/cli/resources-entry.ts');
const bun = realExecutable('bun', '/nonexistent-shim-dir');
const children: ChildProcess[] = [];
const dirs: string[] = [];
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), 'ttr-resources-'));
  dirs.push(path);
  return path;
}
function launch(home: string, args: string[], cwd?: string) {
  const cliArgs =
    args[0] === 'run' ? ['run', '--ignore-pressure', ...args.slice(1)] : args;
  const child = spawn(bun, [entry, ...cliArgs], {
    cwd,
    env: { ...process.env, TTR_RESOURCES_HOME: home },
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
  const deadline = Date.now() + 5000;
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
});

describe('resource admission', () => {
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
          env: { PATH: process.env.PATH },
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
  }, 20_000);
  it('does not deadlock nested commands after an environment marker is removed', async () => {
    const home = await temporary();
    const source = await script(
      home,
      'nested',
      `delete process.env.TTR_RESOURCE_OWNER;require('child_process').execFileSync(${JSON.stringify(bun)},[${JSON.stringify(entry)},'run','--','node','-e','console.log(42)'],{stdio:'inherit',timeout:4000});`
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
        JSON.parse(await readFile(join(home, 'lock', 'owner.json'), 'utf8'))
          .childPid
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
