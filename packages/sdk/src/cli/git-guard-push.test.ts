import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firstOnPath } from './git-guard-status';

const bun = firstOnPath('bun');
const suite = bun ? describe : describe.skip;
const entry = resolve(__dirname, 'index.ts');

let root = '';
let env: NodeJS.ProcessEnv = {};
let guardHome = '';

function git(args: string[], cwd: string, extra: NodeJS.ProcessEnv = {}) {
  return spawnSync('git', args, {
    cwd,
    env: { ...env, ...extra },
    encoding: 'utf8',
  });
}

function ttr(args: string[], cwd = root) {
  return spawnSync(bun!, [entry, ...args], { cwd, env, encoding: 'utf8' });
}

function makeRemote(slug: string) {
  const bare = join(root, 'remotes', `${slug}.git`);
  mkdirSync(bare, { recursive: true });
  git(['init', '--bare', '-b', 'main', bare], root);
  const seed = join(root, `seed-${slug.replace('/', '-')}`);
  git(['clone', bare, seed], root);
  writeFileSync(join(seed, 'README.md'), 'seed\n');
  git(['add', '.'], seed);
  git(['commit', '-m', 'seed'], seed);
  git(['push', 'origin', 'HEAD:main'], seed, {
    GIT_CONFIG_GLOBAL: '/dev/null',
  });
  return bare;
}

function clone(bare: string, name: string) {
  const work = join(root, name);
  git(['clone', bare, work], root);
  return work;
}

function commit(work: string, file: string) {
  writeFileSync(join(work, file), `${file}\n`);
  git(['add', '.'], work);
  git(['commit', '-m', file], work);
}

const remoteHas = (bare: string, branch: string) =>
  git(['rev-parse', '--verify', `refs/heads/${branch}`], bare).status === 0;

const log = () =>
  readFileSync(join(guardHome, 'log.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

suite('ttr git guard pre-push (real git)', { timeout: 60_000 }, () => {
  let guarded = '';
  let other = '';
  let work = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ttr-git-guard-'));
    guardHome = join(root, 'guard');
    const gitconfig = join(root, 'gitconfig');
    writeFileSync(
      gitconfig,
      '[user]\n\tname = Guard Test\n\temail = guard@example.invalid\n[init]\n\tdefaultBranch = main\n'
    );
    env = {
      PATH: process.env.PATH,
      HOME: root,
      TMPDIR: tmpdir(),
      GIT_CONFIG_GLOBAL: gitconfig,
      GIT_CONFIG_NOSYSTEM: '1',
      TTR_GIT_GUARD_HOME: guardHome,
      TTR_RESOURCES_HOME: join(root, 'resources'),
      TUTURUUU_CONFIG: join(root, 'ttr-config.json'),
    };
    guarded = makeRemote('tutur3u/platform');
    other = makeRemote('someone/else');
    work = clone(guarded, 'work');
    // The repository's own tracked hook, as `bun install` configures it.
    mkdirSync(join(work, '.githooks'));
    writeFileSync(
      join(work, '.githooks', 'pre-push'),
      `#!/bin/sh\ncat > /dev/null\necho chained >> ${JSON.stringify(join(root, 'chained.txt'))}\n`
    );
    chmodSync(join(work, '.githooks', 'pre-push'), 0o755);
    git(['config', 'core.hooksPath', '.githooks'], work);
    // Keep the fixture hook out of commits so branch switches never drop it.
    writeFileSync(join(work, '.git', 'info', 'exclude'), '.githooks/\n');

    mkdirSync(join(root, '.claude'));
    writeFileSync(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({ theme: 'dark' })
    );
    const install = ttr([
      'git',
      'guard',
      'install',
      '--repo',
      work,
      '--shell',
      'none',
      '--machine',
      'test-box',
      '--allow-branch',
      'guard-allowed/*',
      '--agents',
    ]);
    expect(install.stderr).toBe('');
    expect(install.status).toBe(0);
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('installs globally and repoints the bypassing clone', () => {
    expect(
      git(['config', '--global', 'core.hooksPath'], root).stdout.trim()
    ).toBe(join(guardHome, 'hooks'));
    expect(git(['config', 'core.hooksPath'], work).stdout.trim()).toBe(
      join(guardHome, 'hooks')
    );
    expect(
      git(['config', 'ttr-guard.chainHooksPath'], work).stdout.trim()
    ).toBe('.githooks');
  });

  it('refuses a new remote branch before any network write', () => {
    git(['checkout', '-b', 'guard-probe/test'], work);
    commit(work, 'probe.txt');
    const push = git(['push', 'origin', 'HEAD:guard-probe/test'], work);
    expect(push.status).not.toBe(0);
    expect(push.stderr).toContain('would create a NEW remote branch');
    expect(push.stderr).toContain('git push origin HEAD:main');
    expect(remoteHas(guarded, 'guard-probe/test')).toBe(false);
    expect(existsSync(join(root, 'chained.txt'))).toBe(false);
    expect(log().at(-1)).toMatchObject({
      event: 'refused',
      kind: 'push',
      repo: 'tutur3u/platform',
      ref: 'guard-probe/test',
      code: 'new-branch',
      machine: 'test-box',
    });
  });

  it('allows a fast-forward push to main and chains the repo hook', () => {
    git(['checkout', 'main'], work);
    commit(work, 'ff.txt');
    const push = git(['push', 'origin', 'HEAD:main'], work);
    expect(push.stderr).not.toContain('refused');
    expect(push.status).toBe(0);
    expect(readFileSync(join(root, 'chained.txt'), 'utf8')).toContain(
      'chained'
    );
  });

  it('refuses a non-fast-forward push to main even with --force', () => {
    git(['reset', '--hard', 'HEAD~1'], work);
    commit(work, 'diverged.txt');
    const push = git(['push', '--force', 'origin', 'HEAD:main'], work);
    expect(push.status).not.toBe(0);
    expect(push.stderr).toContain('is not a fast-forward');
    expect(push.stderr).toContain('cannot be overridden');
    git(['fetch', 'origin'], work);
    git(['reset', '--hard', 'origin/main'], work);
  });

  it('refuses deleting main', () => {
    const push = git(['push', 'origin', ':main'], work);
    expect(push.status).not.toBe(0);
    expect(push.stderr).toContain('would delete a protected branch');
    expect(remoteHas(guarded, 'main')).toBe(true);
  });

  it('allows an allowlisted branch', () => {
    const push = git(['push', 'origin', 'HEAD:guard-allowed/one'], work);
    expect(push.status).toBe(0);
    expect(remoteHas(guarded, 'guard-allowed/one')).toBe(true);
  });

  it('updates an existing release-please branch but never creates one', () => {
    const main = git(['rev-parse', 'refs/heads/main'], guarded).stdout.trim();
    git(['branch', 'release-please--branches--main', main], guarded);
    commit(work, 'release.txt');
    const update = git(
      ['push', 'origin', 'HEAD:release-please--branches--main'],
      work
    );
    expect(update.status).toBe(0);
    const create = git(
      ['push', 'origin', 'HEAD:release-please--branches--other'],
      work
    );
    expect(create.status).not.toBe(0);
    git(['reset', '--hard', 'origin/main'], work);
  });

  it('consumes a logged, single-use override', () => {
    git(['checkout', '-b', 'guard-override/x'], work);
    commit(work, 'override.txt');
    const missing = ttr([
      'git',
      'guard',
      'allow-once',
      '--kind',
      'push',
      '--repo',
      'tutur3u/platform',
      '--ref',
      'guard-override/x',
      '--approved-by',
      'USER',
    ]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('--reason');
    const created = ttr([
      'git',
      'guard',
      'allow-once',
      '--kind',
      'push',
      '--repo',
      'tutur3u/platform',
      '--ref',
      'guard-override/x',
      '--reason',
      'test exception',
      '--approved-by',
      'USER',
    ]);
    expect(created.status).toBe(0);
    const first = git(['push', 'origin', 'HEAD:guard-override/x'], work);
    expect(first.status).toBe(0);
    expect(first.stderr).toContain('allowed once by override');
    expect(remoteHas(guarded, 'guard-override/x')).toBe(true);
    const events = log().map((entry) => entry.event);
    expect(events).toContain('override-created');
    expect(events).toContain('override-consumed');
    commit(work, 'override-2.txt');
    const second = git(['push', 'origin', 'HEAD:guard-override/x'], work);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('pushes a non-main branch');
    git(['checkout', 'main'], work);
  });

  it('leaves unguarded repositories alone', () => {
    const elsewhere = clone(other, 'elsewhere');
    commit(elsewhere, 'x.txt');
    const push = git(['push', 'origin', 'HEAD:anything/new'], elsewhere);
    expect(push.status).toBe(0);
    expect(remoteHas(other, 'anything/new')).toBe(true);
  });

  it('reports state in status --json', () => {
    const status = ttr(['git', 'guard', 'status', '--json', '--repo', work]);
    expect(status.status).toBe(0);
    const value = JSON.parse(status.stdout);
    expect(value).toMatchObject({
      enabled: true,
      machine: 'test-box',
      hook: { installed: true, current: true, globalActive: true },
    });
    expect(value.repos[0]).toMatchObject({ guarded: true });
    expect(value.lastRefusals.length).toBeGreaterThan(0);
    expect(value.config.allowBranches).toEqual(['guard-allowed/*']);
    expect(value.agents).toEqual([
      { path: join(root, '.claude', 'settings.json'), denied: true },
    ]);
  });

  it('uninstall restores the previous hooksPath', () => {
    const result = ttr(['git', 'guard', 'uninstall']);
    expect(result.status).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'))
    ).toEqual({ theme: 'dark' });
    expect(git(['config', 'core.hooksPath'], work).stdout.trim()).toBe(
      '.githooks'
    );
    expect(
      git(['config', '--global', '--get', 'core.hooksPath'], root).status
    ).not.toBe(0);
    expect(execFileSync('ls', [guardHome], { encoding: 'utf8' })).not.toContain(
      'hooks'
    );
  });
});
