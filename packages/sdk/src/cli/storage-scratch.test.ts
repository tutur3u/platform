import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StorageItem, StorageReport } from './storage-analyze';
import { defaultStorageThresholds } from './storage-headroom';
import { type Exec, pruneStorage } from './storage-prune';
import {
  type FsOps,
  realFsOps,
  removeVerifiedTree,
} from './storage-safe-remove';
import {
  containsGitRepository,
  isScratchDirName,
  resolveNpmCacheRoot,
} from './storage-scratch';
import { machineTargets, oldTmpDirs } from './storage-targets';

// Regression coverage for the #6476 deletion-safety review: tmp-old removes
// only identified scratch without git checkouts, and npm cache cleaning is
// pinned to the measured cache root.
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const DAY = 86_400_000;
const later = Date.now() + 30 * DAY;

async function scratch(prefix: string) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

function item(overrides: Partial<StorageItem>): StorageItem {
  return {
    category: 'tmp-old',
    label: 'idle 9d',
    path: '/missing',
    uniqueBytes: 64 * 1024 ** 2,
    allocatedBytes: 0,
    files: 1,
    truncated: false,
    risk: 'moderate',
    ...overrides,
  };
}

function prune(
  items: StorageItem[],
  exec?: Exec,
  overrides: Partial<Parameters<typeof pruneStorage>[0]> = {}
) {
  const report: StorageReport = {
    version: 1,
    generatedAt: new Date(later).toISOString(),
    platform: process.platform,
    method: 'allocated-dedup',
    thresholds: defaultStorageThresholds,
    volumes: [],
    items,
    worktrees: [],
    nodeModules: [],
    docker: null,
    tmpOlderThanDays: 3,
    warnings: [],
  };
  const removed: string[] = [];
  const result = pruneStorage({
    report,
    apply: true,
    categories: [...new Set(items.map((entry) => entry.category))],
    olderThanDays: 7,
    maxRemoveBytes: 1024 ** 4,
    paths: [],
    names: [],
    holds: () => [],
    cwds: () => [],
    openFiles: () => 'none',
    prs: () => null,
    now: later,
    ...(exec ? { exec } : {}),
    removeTree: (identity) => {
      removed.push(identity.target);
    },
    ...overrides,
  });
  const reason = (path: string) =>
    result.steps.find((step) => step.path === path)?.reason;
  return { result, removed, reason };
}

describe('tmp-old scratch identity', () => {
  it('recognizes tool scratch names and nothing else', () => {
    for (const name of [
      'tmp.Ab12Cd34Ef',
      'tmp-4211-x8Kq2pLm',
      'ttr-links-a1B2c3',
      'vitest-8hNq1',
      'turbo-cache-xyz',
      'node-compile-cache',
    ])
      expect(isScratchDirName(name), name).toBe(true);
    for (const name of [
      'tuturuuu',
      'repo-backup',
      'my-project',
      'platform-6476',
      'tmp',
      'Downloads',
    ])
      expect(isScratchDirName(name), name).toBe(false);
  });

  it('detects nested checkouts, linked worktrees and bare repositories', async () => {
    const root = await scratch('ttr-git-');
    await mkdir(join(root, 'plain', 'deep'), { recursive: true });
    await mkdir(join(root, 'clone', 'src', '.git'), { recursive: true });
    await mkdir(join(root, 'worktree'));
    await writeFile(join(root, 'worktree', '.git'), 'gitdir: /elsewhere\n');
    await mkdir(join(root, 'bare', 'objects'), { recursive: true });
    await mkdir(join(root, 'bare', 'refs'));
    await writeFile(join(root, 'bare', 'HEAD'), 'ref: refs/heads/main\n');
    expect(containsGitRepository(join(root, 'plain'))).toBe(false);
    expect(containsGitRepository(join(root, 'clone'))).toBe(true);
    expect(containsGitRepository(join(root, 'worktree'))).toBe(true);
    expect(containsGitRepository(join(root, 'bare'))).toBe(true);
    // Unreadable or missing trees fail closed.
    expect(containsGitRepository(join(root, 'missing'))).toBe(true);
    expect(containsGitRepository(join(root, 'plain'), { maxEntries: 0 })).toBe(
      true
    );
  });

  it('reports only idle scratch dirs without git as tmp-old', async () => {
    const root = await scratch('ttr-tmproot-');
    const repo = join(root, 'repo-with-unmerged-work');
    const scratchClone = join(root, 'tmp-77-cloneAb12');
    const plain = join(root, 'tmp-78-plainAb12');
    await mkdir(join(repo, '.git'), { recursive: true });
    await mkdir(join(scratchClone, 'checkout', '.git'), { recursive: true });
    await mkdir(plain);
    await writeFile(join(plain, 'blob'), 'x');
    const found = oldTmpDirs({
      roots: [root],
      olderThanMs: 8 * DAY,
      now: later,
    }).map((dir) => dir.path);
    expect(found).toEqual([plain]);
  });

  it('never prunes a stale report entry that is not identified scratch', async () => {
    const repo = await scratch('ttr-unmerged-');
    await mkdir(join(repo, '.git'));
    const named = join(await realpath(tmpdir()), `platform-${Date.now()}`);
    roots.push(named);
    await mkdir(named);
    const nested = join(await scratch('ttr-parent-'), 'child');
    await mkdir(nested);
    const plain = await scratch('ttr-plain-');
    const { removed, reason } = prune(
      [repo, named, nested, plain].map((path) => item({ path }))
    );
    expect(reason(repo)).toBe('contains a git repository');
    expect(reason(named)).toBe('not an identified scratch dir');
    expect(reason(nested)).toBe('not a top-level tmp dir');
    expect(removed).toEqual([plain]);
  });

  it('re-checks for a git checkout right before removal', async () => {
    const dir = await scratch('ttr-raced-');
    const { removed, result } = prune([item({ path: dir })], undefined, {
      // The fences run right before the re-check; a checkout created there
      // stands in for one created between planning and removal.
      openFiles: () => {
        mkdirSync(join(dir, 'clone', '.git'), { recursive: true });
        return 'none';
      },
    });
    expect(removed).toEqual([]);
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      reason: 're-check failed: contains a git repository',
    });
  });
});

describe('tmp-old deleting walk', () => {
  // A checkout with unmerged work moved into the scratch dir after every
  // prune-level check: inside the remover, just before or just after the
  // deleting walk's scan.
  async function movableCheckout() {
    const source = await scratch('ttr-checkout-source-');
    const repo = join(source, 'repo');
    await mkdir(join(repo, '.git'), { recursive: true });
    await writeFile(join(repo, 'unmerged.txt'), 'work');
    return repo;
  }

  it.each(['before', 'after'] as const)(
    'never deletes a checkout moved in %s the walk scans',
    async (when) => {
      const dir = await scratch('ttr-walk-');
      await writeFile(join(dir, 'blob'), 'x');
      const repo = await movableCheckout();
      const moved = join(dir, 'clone');
      let movedIn = false;
      const moveIn = () => {
        if (movedIn) return;
        movedIn = true;
        renameSync(repo, moved);
      };
      const hooked: FsOps = {
        ...realFsOps,
        readdir: (path) => {
          if (when === 'before' && path === dir) moveIn();
          return realFsOps.readdir(path);
        },
        unlink: (path) => {
          if (when === 'after') moveIn();
          realFsOps.unlink(path);
        },
      };
      let refused: boolean | undefined;
      const { result } = prune([item({ path: dir })], undefined, {
        removeTree: (identity) => {
          refused = identity.refuseRepositories;
          removeVerifiedTree(identity, hooked);
        },
      });
      expect(refused).toBe(true);
      expect(movedIn).toBe(true);
      expect(result.steps[0]?.status).toBe('failed');
      expect(existsSync(join(moved, '.git'))).toBe(true);
      expect(readFileSync(join(moved, 'unmerged.txt'), 'utf8')).toBe('work');
    }
  );
});

describe('npm cache pinning', () => {
  it('resolves the effective cache root once, preferring npm_config_cache', () => {
    const exec = () => ({ status: 0, stdout: '/from/npm-config\n' });
    expect(
      resolveNpmCacheRoot({
        home: '/home/u',
        env: { npm_config_cache: '/shared/npm' },
        exec,
      })
    ).toBe('/shared/npm');
    expect(
      resolveNpmCacheRoot({
        home: '/home/u',
        env: { NPM_CONFIG_CACHE: '/upper/npm' },
        exec,
      })
    ).toBe('/upper/npm');
    expect(resolveNpmCacheRoot({ home: '/home/u', env: {}, exec })).toBe(
      '/from/npm-config'
    );
    expect(
      resolveNpmCacheRoot({
        home: '/home/u',
        env: {},
        exec: () => ({ status: 0, stdout: 'relative\n' }),
      })
    ).toBe('/home/u/.npm');
    expect(
      resolveNpmCacheRoot({
        home: '/home/u',
        env: {},
        exec: () => {
          throw new Error('npm missing');
        },
      })
    ).toBe('/home/u/.npm');
  });

  it('measures the resolved root and suggests a pinned clean', async () => {
    const root = await scratch('ttr-npmroot-');
    await mkdir(join(root, '_cacache'));
    const npm = machineTargets({
      home: '/nonexistent-home',
      env: {},
      npmCacheRoot: root,
    }).find((target) => target.category === 'npm-cache');
    expect(npm).toMatchObject({
      paths: [join(root, '_cacache')],
      command: `npm cache clean --force --cache ${root}`,
    });
  });

  it('pins npm cache clean to the measured root', async () => {
    const root = await scratch('ttr-npmroot-');
    await mkdir(join(root, '_cacache'));
    const calls: string[][] = [];
    const exec: Exec = (argv) => {
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    const { result } = prune(
      [item({ category: 'npm-cache', path: join(root, '_cacache') })],
      exec
    );
    expect(result.steps[0]).toMatchObject({ status: 'done' });
    expect(calls.filter((argv) => argv[0] === 'npm')).toEqual([
      ['npm', 'cache', 'clean', '--force', '--cache', root],
    ]);
  });

  it('refuses an npm cache entry that is not a measured _cacache root', async () => {
    const root = await scratch('ttr-npmroot-');
    await mkdir(join(root, 'other'));
    const calls: string[][] = [];
    const exec: Exec = (argv) => {
      calls.push(argv);
      return { status: 0, stdout: '', stderr: '' };
    };
    const { reason } = prune(
      [
        item({ category: 'npm-cache', path: join(root, 'other') }),
        item({ category: 'npm-cache', path: '/var/_cacache' }),
      ],
      exec
    );
    expect(reason(join(root, 'other'))).toBe('not an npm _cacache directory');
    expect(reason('/var/_cacache')).toBe(
      'npm cache root is not a directory owned by this user'
    );
    expect(calls.some((argv) => argv[0] === 'npm')).toBe(false);
  });
});
