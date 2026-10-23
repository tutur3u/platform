import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { psFails } = vi.hoisted(() => ({ psFails: { value: false } }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((command: string, ...rest: unknown[]) => {
      if (command === 'ps' && psFails.value) throw new Error('ps unavailable');
      return (actual.execFileSync as (...args: unknown[]) => unknown)(
        command,
        ...rest
      );
    }) as typeof actual.execFileSync,
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
import { nestedOwner, newOwner } from './resources-slots';

const dirs: string[] = [];
afterEach(async () => {
  psFails.value = false;
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

  it('queues a forged marker when ps fails', async () => {
    const { home } = await ownerHome();
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      psFails.value = true;
      expect(
        await nestedOwner(home, { TTR_RESOURCES_ADMITTED: 'forged' }, true)
      ).toBeUndefined();
      expect(
        await nestedOwner(home, { TTR_RESOURCE_OWNER: 'forged-legacy' }, true)
      ).toBeUndefined();
      expect(String(stderr.mock.calls.at(-1)?.[0])).toContain(
        'does not belong to a live admitted job'
      );
    } finally {
      stderr.mockRestore();
    }
  });
});

describe('trivial command exemptions (REV-6431-2)', () => {
  it.each([
    ['node', ['--version']],
    ['git', ['--version']],
    ['cargo', ['-V']],
    ['git', ['status']],
    ['git', ['rev-parse', 'HEAD']],
    ['git', ['remote', '-v']],
    ['git', ['remote', 'get-url', 'origin']],
    ['git', ['branch', '--show-current']],
    ['ls', ['-la']],
  ] as const)('%s %j stays trivial', (name, args) => {
    expect(isTrivialCommand(name, [...args])).toBe(true);
  });

  it.each([
    // Single informational-looking words are project-defined elsewhere.
    ['make', ['help']],
    ['make', ['--version']],
    ['./scripts/ci.sh', ['--help']],
    ['just', ['-v']],
    // Global git options that redirect config or the repository.
    ['git', ['-c', 'core.fsmonitor=./x', 'status']],
    ['git', ['-c', 'core.pager=sh -c "touch pwned"', '-p', 'status']],
    ['git', ['-ccore.pager=less', 'status']],
    ['git', ['--config-env=core.pager=PAGER', 'status']],
    ['git', ['--config-env', 'core.pager=PAGER', 'status']],
    ['git', ['-p', 'branch']],
    ['git', ['--paginate', 'status']],
    ['git', ['--exec-path=/tmp', 'status']],
    ['git', ['status', '-c', 'core.fsmonitor=./x']],
    ['git', ['branch', '--edit-description']],
    ['git', ['remote', 'update']],
    ['git', ['remote', '-v', 'update']],
    ['git', ['remote', 'prune', 'origin']],
    ['git', ['--git-dir=/elsewhere/.git', 'status']],
    ['git', ['--git-dir', '/elsewhere/.git', 'status']],
    ['git', ['--work-tree', '/elsewhere', 'status']],
    ['git', ['-C', '/elsewhere', 'status']],
    // textconv / external diff drivers can run programs.
    ['git', ['diff']],
    ['git', ['log', '-p']],
    ['git', ['show', 'HEAD']],
    ['git', ['diff', '--no-ext-diff', '--no-textconv']],
    // A version flag followed by more arguments is no longer a probe.
    ['node', ['--version', '--', 'script.js']],
    ['node', ['--help', 'script.js']],
    // Recursive listings can be arbitrarily large.
    ['ls', ['-R']],
    ['ls', ['-laR', '/']],
    ['ls', ['--recursive']],
  ] as const)('%s %j queues', (name, args) => {
    expect(isTrivialCommand(name, [...args])).toBe(false);
  });
});

describe('git code-execution vectors stay queued (REV-6431-2)', () => {
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
    expect(isTrivialCommand('/usr/bin/git', ['log', '-p'])).toBe(false);
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
});
