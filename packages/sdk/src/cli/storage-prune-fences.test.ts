import { existsSync } from 'node:fs';
import { link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StorageItem, StorageReport } from './storage-analyze';
import { defaultStorageThresholds } from './storage-headroom';
import type { Hold } from './storage-holds';
import { measureTreesFallback } from './storage-measure';
import { type Exec, pruneStorage } from './storage-prune';
import { createRepoFixture, git } from './storage-test-fixtures';
import { classifyWorktrees, type PullRequestFacts } from './storage-worktrees';

// Regression coverage for the independent review of #6476: every path a
// step touches is fenced, and re-verification covers branch and PR state.
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const later = Date.now() + 3 * 86_400_000;
type Prs = Map<string, PullRequestFacts[]> | null;

function report(
  repo: string,
  holds: Hold[],
  items: StorageItem[] = [],
  prs: Prs = null
): StorageReport {
  return {
    version: 1,
    generatedAt: new Date(later).toISOString(),
    platform: process.platform,
    method: 'allocated-dedup',
    thresholds: defaultStorageThresholds,
    volumes: [],
    items,
    worktrees: repo
      ? classifyWorktrees({
          repo,
          holds,
          cwds: [],
          currentDir: '/',
          prs,
          now: later,
        }).map((entry) => ({ ...entry, uniqueBytes: 1024 }))
      : [],
    nodeModules: [],
    docker: null,
    tmpOlderThanDays: 3,
    warnings: [],
  };
}
const options = (overrides: Partial<Parameters<typeof pruneStorage>[0]>) =>
  pruneStorage({
    report: report('', []),
    apply: true,
    categories: ['worktrees'],
    olderThanDays: 7,
    maxRemoveBytes: 1024 ** 3,
    paths: [],
    names: [],
    holds: () => [],
    cwds: () => [],
    prs: () => null,
    now: later,
    ...overrides,
  });
const item = (overrides: Partial<StorageItem>): StorageItem => ({
  category: 'xcode-simulators',
  label: 'unavailable simulator',
  path: '/sim/a',
  uniqueBytes: 100,
  allocatedBytes: 100,
  files: 1,
  truncated: false,
  risk: 'safe',
  ...overrides,
});

describe('worktree fences after review', { timeout: 30_000 }, () => {
  it('keeps the branch of a squash-merged worktree and reports success', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const squashed = await fixture.worktree('squashed', { commit: true });
    const prs = new Map([
      [
        'squashed',
        [{ state: 'MERGED' as const, number: 7, headRefOid: squashed.head }],
      ],
    ]);
    const result = options({
      report: report(fixture.repo, [], [], prs),
      prs: () => prs,
    });
    expect(existsSync(squashed.path)).toBe(false);
    expect(git(fixture.repo, 'branch', '--list', 'squashed')).toContain(
      'squashed'
    );
    expect(result.steps[0]).toMatchObject({
      status: 'done',
      reason: expect.stringMatching(/branch squashed kept/u),
    });
  });

  it('keeps a worktree whose branch changed at the same HEAD', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const moved = await fixture.worktree('moved');
    const plan = report(fixture.repo, []);
    git(moved.path, 'switch', '-q', '-c', 'renamed');
    const result = options({ report: plan });
    expect(existsSync(moved.path)).toBe(true);
    expect(
      result.steps.find((step) => step.path === moved.path)?.reason
    ).toMatch(/branch changed/u);
  });

  it('does not prune a held orphaned record, nor records outside --path', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    const gone = await fixture.worktree('gone');
    const other = await fixture.worktree('other-gone');
    await rm(gone.path, { recursive: true, force: true });
    await rm(other.path, { recursive: true, force: true });
    const holds = [{ path: gone.path, owner: 'lane', glob: false }];
    const calls: string[][] = [];
    const exec: Exec = (argv) => {
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    const held = options({
      report: report(fixture.repo, holds),
      holds: () => holds,
      exec,
    });
    expect(
      held.steps.find((step) => step.path.startsWith('git-records:'))?.status
    ).toBe('skipped');
    const scoped = options({
      report: report(fixture.repo, []),
      paths: [other.path],
      exec,
    });
    expect(
      scoped.steps.find((step) => step.path.startsWith('git-records:'))?.status
    ).toBe('skipped');
    expect(calls.filter((argv) => argv.includes('prune'))).toEqual([]);
  });

  it('never runs rust-cache for a dirty tree and uses the primary checkout script', async () => {
    const fixture = await createRepoFixture();
    roots.push(fixture.root);
    await mkdir(join(fixture.repo, 'scripts'));
    await writeFile(join(fixture.repo, 'scripts', 'rust-cache.js'), '');
    const clean = await fixture.worktree('clean');
    const dirty = await fixture.worktree('dirty');
    await writeFile(join(dirty.path, 'wip.txt'), 'x');
    const target = (path: string) =>
      item({
        category: 'rust-target',
        path: join(path, 'apps/backend/target'),
        worktree: path,
      });
    const calls: string[][] = [];
    const exec: Exec = (argv) => {
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    options({
      report: report(
        fixture.repo,
        [],
        [target(clean.path), target(dirty.path)]
      ),
      categories: ['rust-target'],
      exec,
    });
    const runs = calls.filter((argv) => argv[0] === 'node');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.[1]).toBe(join(fixture.repo, 'scripts', 'rust-cache.js'));
    expect(runs[0]).toContain(join(clean.path, 'apps/backend/target'));
  });
});

describe('machine cache fences after review', () => {
  it('fences every path a cache command touches and re-checks cache users', () => {
    const calls: string[][] = [];
    const exec: Exec = (argv) => {
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    const items = [item({ path: '/sim/a' }), item({ path: '/sim/b' })];
    const held = options({
      report: report('', [], items),
      categories: ['xcode-simulators'],
      holds: () => [{ path: '/sim/b', owner: 'ios-lane', glob: false }],
      exec,
    });
    expect(held.steps[0]).toMatchObject({
      status: 'skipped',
      reason: 'held by ios-lane',
    });
    expect(calls.some((argv) => argv[0] === 'xcrun')).toBe(false);

    let ps = 0;
    const busyLater: Exec = (argv) => {
      if (argv[0] === 'ps')
        return { status: 0, stdout: ps++ ? 'bun install\n' : '', stderr: '' };
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    const raced = options({
      report: report(
        '',
        [],
        [item({ category: 'bun-cache', path: '/bun', risk: 'moderate' })]
      ),
      categories: ['bun-cache'],
      exec: busyLater,
    });
    expect(raced.steps[0]).toMatchObject({
      status: 'failed',
      reason: 'a process started using this cache',
    });
    expect(calls.some((argv) => argv[0] === 'bun')).toBe(false);
  });

  it('treats an unreadable process list as busy', () => {
    const failing: Exec = () => ({
      status: 1,
      stdout: '',
      stderr: 'ps: denied',
    });
    const result = options({
      report: report('', [], [item({ category: 'npm-cache', path: '/npm' })]),
      categories: ['npm-cache'],
      exec: failing,
    });
    expect(result.steps[0]).toMatchObject({
      status: 'skipped',
      reason: 'a process is using this cache',
    });
  });
});

describe('hard-link measurement', () => {
  it('counts a hard link as unique only when every link is inside the tree', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-links-'));
    roots.push(dir);
    await mkdir(join(dir, 'tree'));
    await mkdir(join(dir, 'cache'));
    await writeFile(join(dir, 'tree', 'inside'), Buffer.alloc(64 * 1024, 1));
    await link(join(dir, 'tree', 'inside'), join(dir, 'tree', 'inside-2'));
    await writeFile(join(dir, 'cache', 'shared'), Buffer.alloc(64 * 1024, 2));
    await link(join(dir, 'cache', 'shared'), join(dir, 'tree', 'shared'));
    const [tree, cache] = measureTreesFallback([
      { root: join(dir, 'tree') },
      { root: join(dir, 'cache') },
    ]).results;
    expect(tree?.apparentBytes).toBe(128 * 1024);
    expect(tree?.uniqueBytes).toBe(tree!.allocatedBytes / 2);
    // Order-independent: the cache job still sees its own file.
    expect(cache?.apparentBytes).toBe(64 * 1024);
    expect(cache?.uniqueBytes).toBe(0);
  });
});
