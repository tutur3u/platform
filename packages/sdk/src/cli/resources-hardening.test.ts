import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { psFails } = vi.hoisted(() => ({ psFails: { value: false } }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((command: string, ...rest: unknown[]) => {
      if (/(^|\/)ps$/u.test(command) && psFails.value)
        throw new Error('ps unavailable');
      return (actual.execFileSync as (...args: unknown[]) => unknown)(
        command,
        ...rest
      );
    }) as typeof actual.execFileSync,
  };
});
// Linux's /proc lineage fallback would otherwise supply the evidence that a
// failing ps withholds.
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: ((path: string, ...rest: unknown[]) => {
      if (psFails.value && String(path).startsWith('/proc/'))
        throw new Error('ENOENT');
      return (actual.readFileSync as (...args: unknown[]) => unknown)(
        path,
        ...rest
      );
    }) as typeof actual.readFileSync,
  };
});
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  // A small host: floor(8 GiB / 4) = 2 lanes, 4 CPUs - 2 = 2 lanes.
  totalmem: () => 8 * 1024 ** 3,
  availableParallelism: () => 4,
}));

import { isTrivialCommand } from './resources-command';
import {
  atomicJson,
  defaultResourceConfig,
  effectiveResourceLanes,
  hostLaneCeiling,
  laneResourceConfig,
} from './resources-config';
import { nestedOwner, newOwner, processLineage } from './resources-slots';

const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  psFails.value = false;
  for (const child of children.splice(0)) child.kill('SIGKILL');
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('nested markers need process-tree evidence (REV-6431-1)', () => {
  const ownerHome = async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-hardening-'))
    );
    dirs.push(home);
    // The parent process is a live ancestor, so ancestry can vouch for it.
    const owner = { ...newOwner('outer'), pid: process.ppid };
    await atomicJson(join(home, 'slots', '0', 'owner.json'), owner);
    return { home, owner };
  };

  it('accepts a live marker only while ps confirms the process tree', async () => {
    const { home, owner } = await ownerHome();
    const env = { TTR_RESOURCES_ADMITTED: owner.token };
    expect((await nestedOwner(home, env, true))?.token).toBe(owner.token);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      psFails.value = true;
      expect(await nestedOwner(home, env, true)).toBeUndefined();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'process tree could not be read'
      );
    } finally {
      stderr.mockRestore();
    }
  });

  it('refuses a copied live token from an unrelated owner when ps fails', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-hardening-'))
    );
    dirs.push(home);
    // A live owner outside this process tree: its real token was copied.
    const unrelated = spawn('sleep', ['30'], { stdio: 'ignore' });
    children.push(unrelated);
    const owner = { ...newOwner('unrelated'), pid: unrelated.pid! };
    await atomicJson(join(home, 'slots', '0', 'owner.json'), owner);
    const env = { TTR_RESOURCES_ADMITTED: owner.token };
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      expect(await nestedOwner(home, env, true)).toBeUndefined();
      psFails.value = true;
      // The previous code trusted any live marker once ps failed.
      expect(await nestedOwner(home, env, true)).toBeUndefined();
    } finally {
      stderr.mockRestore();
    }
  });
});

describe('ancestry ignores a fake ps on PATH (REV-6492-3)', () => {
  it('does not let a symlinked ps fabricate ancestry', async () => {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-fake-ps-'))
    );
    dirs.push(home);
    const unrelated = spawn('sleep', ['30'], { stdio: 'ignore' });
    children.push(unrelated);
    const owner = { ...newOwner('unrelated'), pid: unrelated.pid! };
    await atomicJson(join(home, 'slots', '0', 'owner.json'), owner);
    // The fake claims the unrelated owner is this process's grandparent.
    const sentinel = join(home, 'fake-ps-ran');
    const script = join(home, 'fake-ps.sh');
    await writeFile(
      script,
      `#!/bin/sh\ntouch '${sentinel}'\necho '${process.ppid} ${owner.pid} ${owner.pid}'\necho '${owner.pid} 1 ${owner.pid}'\necho '${process.pid} ${process.ppid} ${owner.pid}'\n`
    );
    await chmod(script, 0o755);
    const bin = join(home, 'bin');
    await mkdir(bin);
    await symlink(script, join(bin, 'ps'));
    const previous = process.env.PATH;
    process.env.PATH = `${bin}${delimiter}${previous ?? ''}`;
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      expect(processLineage(true)?.pids.has(owner.pid)).toBe(false);
      expect(
        await nestedOwner(home, { TTR_RESOURCES_ADMITTED: owner.token }, true)
      ).toBeUndefined();
      expect(await nestedOwner(home, {}, true)).toBeUndefined();
      await expect(stat(sentinel)).rejects.toThrow();
    } finally {
      process.env.PATH = previous;
      stderr.mockRestore();
    }
  });
});

describe('trivial command exemptions (REV-6431-2, REV-6492-1/2/4)', () => {
  it.each([
    ['cat', ['package.json']],
    ['echo', ['ok']],
    ['/bin/cat', ['package.json']],
  ] as const)('%s %j stays trivial', (name, args) => {
    expect(isTrivialCommand(name, [...args])).toBe(true);
  });

  it.each([
    // Runtimes and package managers load code before reading any flag.
    ['node', ['--version']],
    ['node', ['--help']],
    ['npm', ['--version']],
    ['npx', ['--version']],
    ['bun', ['--version']],
    ['cargo', ['-V']],
    ['make', ['help']],
    ['./scripts/ci.sh', ['--help']],
    // Every git subcommand can run fsmonitor, hooks, pagers or drivers.
    ['git', ['--version']],
    ['git', ['status']],
    ['git', ['ls-files']],
    ['git', ['branch']],
    ['git', ['branch', 'feature']],
    ['git', ['rev-parse', 'HEAD']],
    ['git', ['remote', '-v']],
    ['git', ['-c', 'core.pager=sh -c "touch pwned"', '-p', 'status']],
    ['git', ['--config-env=core.pager=PAGER', 'status']],
    ['git', ['diff']],
    ['git', ['show', 'HEAD']],
    // `ls` always queues: recursion hides in `-1R` and `--rec` abbreviations.
    ['ls', ['-la']],
    ['ls', ['-1R']],
    ['ls', ['--rec']],
    ['ls', ['--recursive']],
    ['/bin/ls', ['-l']],
  ] as const)('%s %j queues', (name, args) => {
    expect(isTrivialCommand(name, [...args])).toBe(false);
  });

  it('queues a basename match that is not the trusted system tool', async () => {
    const dir = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-impostor-'))
    );
    dirs.push(dir);
    for (const tool of ['ls', 'cat', 'node']) {
      await writeFile(join(dir, tool), '#!/bin/sh\nexit 0\n');
      await chmod(join(dir, tool), 0o755);
    }
    await symlink('/bin/echo', join(dir, 'pwd'));
    expect(isTrivialCommand(join(dir, 'cat'), ['x'])).toBe(false);
    expect(isTrivialCommand(join(dir, 'node'), ['--version'])).toBe(false);
    // PATH lookup decides on the first match, as spawning would.
    const env = { PATH: `${dir}${delimiter}/bin${delimiter}/usr/bin` };
    expect(isTrivialCommand('cat', ['x'], env)).toBe(false);
    // A symlink to a trusted binary under another name is not that tool.
    expect(isTrivialCommand('pwd', [], env)).toBe(false);
    expect(isTrivialCommand('echo', ['ok'], env)).toBe(true);
  });

  it('queues even trusted tools while loader variables are set', () => {
    const path = process.env.PATH;
    expect(isTrivialCommand('cat', ['x'], { PATH: path })).toBe(true);
    for (const key of ['LD_PRELOAD', 'LD_AUDIT', 'DYLD_INSERT_LIBRARIES'])
      expect(
        isTrivialCommand('cat', ['x'], { PATH: path, [key]: '/tmp/evil.so' })
      ).toBe(false);
  });
});

describe('git code-execution vectors stay queued (REV-6431-2, REV-6492-1)', () => {
  it('git diff runs a repository textconv program, so it queues', async () => {
    const repo = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-textconv-'))
    );
    dirs.push(repo);
    const sentinel = join(repo, 'textconv-ran');
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
      });
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'diff.probe.textconv', `touch '${sentinel}'; cat`);
    await writeFile(join(repo, '.gitattributes'), '*.probe diff=probe\n');
    await writeFile(join(repo, 'a.probe'), 'one\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    await writeFile(join(repo, 'a.probe'), 'two\n');
    git('diff');
    await expect(stat(sentinel)).resolves.toBeTruthy();
    expect(isTrivialCommand('git', ['diff'])).toBe(false);
    expect(isTrivialCommand('/usr/bin/git', ['diff'])).toBe(false);
  });
});

describe('host lane ceiling (REV-6431-3)', () => {
  it('caps configured base lanes by the host ceiling', () => {
    expect(hostLaneCeiling()).toBe(2);
    const config = {
      ...defaultResourceConfig(),
      validationLanes: 4,
      maxValidationLanes: 4,
      vitestWorkers: 4,
      buildJobs: 4,
    };
    expect(effectiveResourceLanes(config)).toBe(2);
    // Workers are split across the lanes that can actually be admitted.
    expect(laneResourceConfig(config).vitestWorkers).toBeGreaterThanOrEqual(1);
    expect(
      effectiveResourceLanes({
        ...config,
        validationLanes: 1,
        maxValidationLanes: 1,
      })
    ).toBe(1);
  });
});

describe('status surfaces unusable configuration (REV-6431-3)', () => {
  const status = async (home: string) => {
    const { runResourcesCommand } = await import('./resources');
    const out: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
      });
    const previous = process.env.TTR_RESOURCES_HOME;
    process.env.TTR_RESOURCES_HOME = home;
    try {
      await runResourcesCommand(['status', '--json']);
    } finally {
      write.mockRestore();
      if (previous === undefined) delete process.env.TTR_RESOURCES_HOME;
      else process.env.TTR_RESOURCES_HOME = previous;
    }
    return JSON.parse(out.join('')) as {
      config: { state: string; error?: string };
      warnings: string[];
      effectiveLanes: number;
      occupied: number;
    };
  };
  const home = async () => {
    const path = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-status-'))
    );
    dirs.push(path);
    return path;
  };

  it('reports invalid, disabled and over-ceiling configs instead of failing', async () => {
    const invalid = await home();
    await writeFile(join(invalid, 'config.json'), '{not json');
    // A second running lane must not close status while the config is broken.
    await atomicJson(join(invalid, 'slots', '1', 'owner.json'), {
      ...newOwner('lane-two'),
      pid: process.pid,
    });
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const broken = await status(invalid).finally(() => stderr.mockRestore());
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    expect(broken.config.state).toBe('invalid');
    expect(broken.warnings[0]).toContain('not valid JSON');
    expect(broken.occupied).toBe(1);

    const disabled = await home();
    await atomicJson(join(disabled, 'config.json'), {
      ...defaultResourceConfig(),
      enabled: false,
      validationLanes: 4,
      maxValidationLanes: 4,
      vitestWorkers: 4,
      buildJobs: 4,
    });
    const report = await status(disabled);
    expect(report.config.state).toBe('disabled');
    expect(report.effectiveLanes).toBe(2);
    expect(report.warnings.join('\n')).toContain('admission is disabled');
    expect(report.warnings.join('\n')).toContain('exceeds this host');
  });

  it('warns when only the burst ceiling exceeds the host lanes (REV-6492-8)', async () => {
    const burst = await home();
    await atomicJson(join(burst, 'config.json'), {
      ...defaultResourceConfig(),
      validationLanes: 1,
      maxValidationLanes: 4,
      vitestWorkers: 2,
      buildJobs: 2,
    });
    const report = await status(burst);
    expect(report.effectiveLanes).toBe(2);
    expect(report.warnings.join('\n')).toContain(
      'maxValidationLanes 4 exceeds this host'
    );
    expect(report.warnings.join('\n')).not.toContain(
      'validationLanes 1 exceeds'
    );
  });
});
