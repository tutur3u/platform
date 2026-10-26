import { link, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  foldSmallTmp,
  type StorageItem,
  type StorageReport,
} from './storage-analyze';
import { defaultStorageThresholds, GiB } from './storage-headroom';
import { measureTreesFallback } from './storage-measure';
import { suggestActions } from './storage-suggest';
import type { WorktreeReport } from './storage-worktrees';

const item = (overrides: Partial<StorageItem>): StorageItem => ({
  category: 'bun-cache',
  label: 'label',
  path: '/p',
  uniqueBytes: 0,
  allocatedBytes: 0,
  files: 0,
  truncated: false,
  risk: 'safe',
  ...overrides,
});
const worktree = (
  overrides: Partial<WorktreeReport & { uniqueBytes: number }>
) => ({
  repo: '/repo',
  path: '/wt',
  branch: 'feat/x',
  head: 'a'.repeat(40),
  classification: 'merged-clean' as const,
  evidence: 'pr #1 merged at HEAD',
  dirtyPaths: 0,
  ignoredKept: [],
  locked: false,
  current: false,
  busy: false,
  heldBy: [],
  owner: 'other',
  idleDays: 3,
  pullRequest: null,
  fences: [],
  uniqueBytes: 300 * 1024 ** 2,
  ...overrides,
});
const report = (overrides: Partial<StorageReport>): StorageReport => ({
  version: 1,
  generatedAt: new Date(0).toISOString(),
  platform: 'darwin',
  method: 'apfs-private',
  thresholds: defaultStorageThresholds,
  volumes: [],
  items: [],
  worktrees: [],
  nodeModules: [],
  docker: null,
  tmpOlderThanDays: 3,
  warnings: [],
  ...overrides,
});

describe('storage suggestions', () => {
  it('suggests removing merged clean worktrees and sends fenced ones to review', () => {
    const { actions, review } = suggestActions(
      report({
        worktrees: [
          worktree({}),
          worktree({
            path: '/dirty',
            classification: 'dirty',
            fences: ['2 dirty path(s)'],
          }),
          worktree({ path: '/held', fences: ['held by mastermind'] }),
          worktree({
            path: '/main',
            classification: 'primary',
            fences: ['primary checkout'],
          }),
        ],
      })
    );
    const removal = actions.find((action) => action.category === 'worktrees');
    expect(removal?.command).toBe(
      'git -C /repo worktree remove /wt && git -C /repo branch -d feat/x'
    );
    expect(removal?.command).not.toMatch(/-D|--force/u);
    expect(
      actions.filter((action) => action.category === 'worktrees')
    ).toHaveLength(1);
    expect(review.map((entry) => entry.path).sort()).toEqual([
      '/dirty',
      '/held',
    ]);
  });

  it('prices stale node_modules and machine caches with exact commands and risk', () => {
    const { actions } = suggestActions(
      report({
        worktrees: [
          worktree({
            path: '/repo',
            classification: 'primary',
            fences: ['primary checkout'],
          }),
        ],
        items: [
          item({
            category: 'node-modules-stale',
            path: '/repo/node_modules',
            worktree: '/repo',
            uniqueBytes: 10 * GiB,
            risk: 'moderate',
          }),
          item({
            category: 'bun-cache',
            uniqueBytes: 2 * GiB,
            risk: 'moderate',
          }),
          item({
            category: 'pub-cache',
            uniqueBytes: 0.5 * GiB,
            risk: 'moderate',
          }),
          item({ category: 'trash', uniqueBytes: GiB, risk: 'high' }),
        ],
      })
    );
    const byCategory = Object.fromEntries(
      actions.map((action) => [action.category, action])
    );
    expect(byCategory['node-modules-stale']).toMatchObject({
      reclaimableBytes: 10 * GiB,
      risk: 'moderate',
      command:
        'ttr storage prune --category node-modules-stale --path /repo --apply',
    });
    expect(byCategory['node-modules-stale']?.note).toMatch(/owner approval/u);
    expect(byCategory['bun-cache']).toMatchObject({
      command: 'bun pm cache rm',
      apply: 'named',
    });
    // Below the 1 GiB floor for shared caches.
    expect(byCategory['pub-cache']).toBeUndefined();
    expect(byCategory.trash).toMatchObject({ risk: 'high', apply: 'manual' });
    // Safe actions sort first.
    expect(actions.map((action) => action.risk)).toEqual(
      [...actions.map((action) => action.risk)].sort(
        (a, b) =>
          ['safe', 'moderate', 'high'].indexOf(a) -
          ['safe', 'moderate', 'high'].indexOf(b)
      )
    );
  });
});

describe('storage suggestion fences', () => {
  it('never proposes held paths or worktrees active within a day', () => {
    const { actions, review } = suggestActions(
      report({
        worktrees: [worktree({ path: '/fresh', idleDays: 0.2 })],
        items: [
          item({
            category: 'tmp-old',
            path: '/tmp/evidence',
            uniqueBytes: 200 * 1024 ** 2,
            heldBy: ['tuturuuu'],
            risk: 'moderate',
          }),
          item({
            category: 'npm-cache',
            path: '/npm',
            uniqueBytes: GiB,
            heldBy: ['mastermind'],
          }),
        ],
      })
    );
    expect(actions).toEqual([]);
    expect(review.map((entry) => entry.path).sort()).toEqual([
      '/fresh',
      '/npm',
      '/tmp/evidence',
    ]);
    expect(review.find((entry) => entry.path === '/tmp/evidence')?.reason).toBe(
      'tmp-old held by tuturuuu'
    );
  });
});

describe('analysis helpers', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0))
      await rm(dir, { recursive: true, force: true });
  });

  it('folds tiny idle tmp dirs into one row', () => {
    const items = [
      item({ category: 'tmp-old', path: '/tmp/a', uniqueBytes: 10 }),
      item({ category: 'tmp-old', path: '/tmp/b', uniqueBytes: 20 }),
      item({
        category: 'tmp-old',
        path: '/tmp/big',
        uniqueBytes: 50 * 1024 ** 2,
      }),
    ];
    const folded = foldSmallTmp(items);
    expect(folded.map((entry) => entry.path)).toEqual([
      '/tmp/big',
      '(tmp-small)',
    ]);
    expect(folded[1]?.uniqueBytes).toBe(30);
  });

  it('counts hard links once in the portable walker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ttr-measure-'));
    dirs.push(dir);
    await writeFile(join(dir, 'a'), Buffer.alloc(64 * 1024, 1));
    await link(join(dir, 'a'), join(dir, 'b'));
    const { results } = measureTreesFallback([{ root: dir }]);
    expect(results[0]?.files).toBe(2);
    expect(results[0]?.apparentBytes).toBe(64 * 1024);
  });
});
