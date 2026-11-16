import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkGhInvocation } from './git-guard-gh';
import { createOverride } from './git-guard-log';
import { firstOnPath } from './git-guard-status';

const bun = firstOnPath('bun');
const suite = bun ? describe : describe.skip;
const entry = resolve(__dirname, 'index.ts');

describe('checkGhInvocation', () => {
  let home = '';
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'ttr-gh-guard-unit-'));
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ enabled: true, machine: 'unit-box' })
    );
  });
  afterAll(() => rmSync(home, { recursive: true, force: true }));

  const check = (argv: string[], remotes: string[], env = {}) =>
    checkGhInvocation({ argv, home, remotes, env, stderr: () => {} });

  it('refuses gh pr create for a guarded working-directory remote', async () => {
    expect(await check(['pr', 'create'], ['tutur3u/platform'])).toBe(
      'tutur3u/platform'
    );
  });

  it('honours an explicit unguarded --repo and GH_REPO', async () => {
    expect(
      await check(['pr', 'create', '-R', 'someone/else'], ['tutur3u/platform'])
    ).toBeNull();
    expect(
      await check(['pr', 'create'], [], { GH_REPO: 'upskii/platform' })
    ).toBe('upskii/platform');
  });

  it('refuses GraphQL PR creation when the repository is unknown', async () => {
    expect(
      await check(
        [
          'api',
          'graphql',
          '-f',
          'query=mutation{createPullRequest(input:{}){}}',
        ],
        []
      )
    ).toBe('unknown');
  });

  it('a pr override is single-use and expires', async () => {
    await createOverride(
      {
        kind: 'pr',
        repo: 'tutur3u/platform',
        reason: 'release-please exception',
        approvedBy: 'USER',
        machine: 'unit-box',
      },
      home
    );
    await createOverride(
      {
        kind: 'pr',
        repo: 'tutur3u/platform',
        reason: 'expired',
        approvedBy: 'USER',
        machine: 'unit-box',
        ttlMinutes: 1,
        now: new Date(Date.now() - 120_000),
      },
      home
    );
    expect(await check(['pr', 'create'], ['tutur3u/platform'])).toBeNull();
    expect(await check(['pr', 'create'], ['tutur3u/platform'])).toBe(
      'tutur3u/platform'
    );
    const events = readFileSync(join(home, 'log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      events.filter((event) => event.event === 'override-consumed')
    ).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ event: 'refused', kind: 'pr' });
  });

  it('requires a reason and an approver for every override', async () => {
    await expect(
      createOverride(
        { kind: 'pr', repo: 'a/b', approvedBy: 'USER', machine: 'm' },
        home
      )
    ).rejects.toThrow('--reason');
    await expect(
      createOverride(
        {
          kind: 'push',
          repo: 'a/b',
          reason: 'x',
          approvedBy: 'U',
          machine: 'm',
        },
        home
      )
    ).rejects.toThrow('exact --ref');
  });
});

suite('gh shim (installed)', () => {
  let root = '';
  let env: NodeJS.ProcessEnv = {};
  let work = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ttr-gh-guard-'));
    const fake = join(root, 'fake-bin');
    mkdirSync(fake);
    writeFileSync(join(fake, 'gh'), '#!/bin/sh\necho "REAL GH $*"\n');
    chmodSync(join(fake, 'gh'), 0o755);
    const gitconfig = join(root, 'gitconfig');
    writeFileSync(gitconfig, '');
    const guardHome = join(root, 'guard');
    env = {
      PATH: `${join(guardHome, 'bin')}:${fake}:${process.env.PATH}`,
      HOME: root,
      GIT_CONFIG_GLOBAL: gitconfig,
      GIT_CONFIG_NOSYSTEM: '1',
      TTR_GIT_GUARD_HOME: guardHome,
      TTR_RESOURCES_HOME: join(root, 'resources'),
      TUTURUUU_CONFIG: join(root, 'ttr-config.json'),
    };
    work = join(root, 'work');
    spawnSync('git', ['init', '-b', 'main', work], { env });
    spawnSync(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/tutur3u/platform.git'],
      { cwd: work, env }
    );
    const install = spawnSync(
      bun!,
      [entry, 'git', 'guard', 'install', '--repo', work, '--shell', 'none'],
      { cwd: work, env, encoding: 'utf8' }
    );
    expect(install.status).toBe(0);
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const gh = (args: string[]) =>
    spawnSync('gh', args, { cwd: work, env, encoding: 'utf8' });

  it('passes ordinary commands straight to the real gh', () => {
    const result = gh(['auth', 'status']);
    expect(result.stdout).toBe('REAL GH auth status\n');
    expect(gh(['pr', 'list']).stdout).toBe('REAL GH pr list\n');
  });

  it('refuses gh pr create and REST pull creation on a guarded repo', () => {
    const create = gh(['pr', 'create', '--fill']);
    expect(create.status).toBe(1);
    expect(create.stdout).toBe('');
    expect(create.stderr).toContain('pull request creation (pr create)');
    const api = gh(['api', '-X', 'POST', 'repos/tutur3u/platform/pulls']);
    expect(api.status).toBe(1);
    expect(api.stdout).toBe('');
  });

  it('lets an unguarded repo through', () => {
    expect(gh(['pr', 'create', '-R', 'someone/else']).stdout).toBe(
      'REAL GH pr create -R someone/else\n'
    );
  });

  it('reports the shim as active in status', () => {
    const status = spawnSync(
      bun!,
      [entry, 'git', 'guard', 'status', '--json'],
      { cwd: work, env, encoding: 'utf8' }
    );
    expect(JSON.parse(status.stdout).gh).toMatchObject({
      shimInstalled: true,
      active: true,
    });
  });
});
