import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRepoFixture, git } from './storage-test-fixtures';
import {
  classifyWorktrees,
  mergeEvidence,
  nodeModulesStaleness,
  type PullRequestFacts,
  parseWorktreeList,
} from './storage-worktrees';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const created = await createRepoFixture();
  roots.push(created.root);
  return created;
}
const prs = (entries: Record<string, PullRequestFacts[]>) =>
  new Map(Object.entries(entries));
const classify = (
  repo: string,
  options: Partial<Parameters<typeof classifyWorktrees>[0]> = {}
) =>
  classifyWorktrees({ repo, holds: [], cwds: [], currentDir: '/', ...options });

describe('worktree list parsing', () => {
  it('reads primary, branch, detached, locked and prunable records', () => {
    const entries = parseWorktreeList(
      'worktree /repo\nHEAD aaa\nbranch refs/heads/main\n\nworktree /wt\nHEAD bbb\ndetached\nlocked reason\n\nworktree /gone\nHEAD ccc\nbranch refs/heads/x\nprunable gitdir file points to non-existent location\n'
    );
    expect(
      entries.map((entry) => [
        entry.path,
        entry.primary,
        entry.branch,
        entry.locked,
        entry.prunable,
      ])
    ).toEqual([
      ['/repo', true, 'main', false, false],
      ['/wt', false, null, true, false],
      ['/gone', false, 'x', false, true],
    ]);
  });
});

describe('worktree classification', { timeout: 30_000 }, () => {
  it('classifies primary, dirty, unmerged, merged-clean and orphaned trees', async () => {
    const { repo, worktree } = await fixture();
    const merged = await worktree('merged');
    const dirty = await worktree('dirty');
    await writeFile(join(dirty.path, 'scratch.txt'), 'untracked\n');
    const unmerged = await worktree('unmerged', { commit: true });
    const gone = await worktree('gone');
    await rm(gone.path, { recursive: true, force: true });

    const byPath = new Map(classify(repo).map((entry) => [entry.path, entry]));
    expect(byPath.get(repo)?.classification).toBe('primary');
    expect(byPath.get(repo)?.fences).toContain('primary checkout');
    expect(byPath.get(merged.path)).toMatchObject({
      classification: 'merged-clean',
      fences: [],
      evidence: 'HEAD is in origin/main',
    });
    expect(byPath.get(dirty.path)?.classification).toBe('dirty');
    expect(byPath.get(dirty.path)?.fences).toContain('1 dirty path(s)');
    expect(byPath.get(unmerged.path)?.classification).toBe('unmerged');
    expect(byPath.get(unmerged.path)?.fences.join()).toMatch(/unmerged/u);
    expect(byPath.get(gone.path)?.classification).toBe('orphaned');
  });

  it('fences held, busy, locked, current and preserve/* worktrees', async () => {
    const { repo, worktree } = await fixture();
    const held = await worktree('held');
    const busy = await worktree('busy');
    const locked = await worktree('locked');
    git(repo, 'worktree', 'lock', locked.path);
    const current = await worktree('current');
    const preserve = await worktree('preserve/keep');
    const byPath = new Map(
      classify(repo, {
        holds: [{ path: held.path, owner: 'mastermind', glob: false }],
        cwds: [{ pid: 1, cwd: join(busy.path, 'src') }],
        currentDir: current.path,
      }).map((entry) => [entry.path, entry])
    );
    expect(byPath.get(held.path)?.fences).toEqual(['held by mastermind']);
    expect(byPath.get(held.path)?.heldBy).toEqual(['mastermind']);
    expect(byPath.get(busy.path)?.fences).toEqual(['process working inside']);
    expect(byPath.get(locked.path)?.fences).toEqual(['locked']);
    expect(byPath.get(current.path)?.fences).toEqual(['current worktree']);
    expect(byPath.get(preserve.path)?.fences).toEqual(['preserve/* branch']);
  });

  it('treats a squash-merged PR as merged only when its head is the local HEAD', async () => {
    const { repo, worktree } = await fixture();
    const squashed = await worktree('squashed', { commit: true });
    const drifted = await worktree('drifted', { commit: true });
    const pr = (
      head: string,
      state: PullRequestFacts['state'] = 'MERGED',
      number = 1
    ) => [{ state, number, headRefOid: head }];
    const result = classify(repo, {
      prs: prs({
        squashed: pr(squashed.head),
        drifted: pr('0'.repeat(40), 'MERGED', 2),
      }),
    });
    const byPath = new Map(result.map((entry) => [entry.path, entry]));
    expect(byPath.get(squashed.path)).toMatchObject({
      classification: 'merged-clean',
      evidence: 'pr #1 merged at HEAD',
    });
    expect(byPath.get(drifted.path)?.classification).toBe('unmerged');
    expect(byPath.get(drifted.path)?.evidence).toMatch(/local HEAD differs/u);
  });

  it('keeps an open PR unmerged even when HEAD is already in the base', async () => {
    const { repo, worktree } = await fixture();
    const open = await worktree('open');
    const entry = parseWorktreeList(
      git(repo, 'worktree', 'list', '--porcelain')
    ).find((item) => item.path === open.path)!;
    const proof = mergeEvidence(
      (cwd, args) => git(cwd, ...args),
      entry,
      'origin/main',
      prs({ open: [{ state: 'OPEN', number: 9, headRefOid: open.head }] })
    );
    expect(proof).toMatchObject({ merged: false, evidence: 'pr #9 open' });
  });
});

describe('node_modules staleness', () => {
  it('flags Bun stores far larger than the lockfile', async () => {
    const { root } = await fixture();
    const checkout = join(root, 'checkout');
    await mkdir(join(checkout, 'node_modules', '.bun', 'node_modules'), {
      recursive: true,
    });
    await writeFile(
      join(checkout, 'bun.lock'),
      '{\n  "lockfileVersion": 1,\n  "packages": {\n    "a": ["a@1.0.0"],\n    "b": ["b@1.0.0"],\n  },\n}\n'
    );
    for (let index = 0; index < 60; index++)
      await mkdir(join(checkout, 'node_modules', '.bun', `pkg${index}@1.0.0`));
    expect(nodeModulesStaleness(checkout)).toEqual({
      checkout,
      bunEntries: 60,
      lockPackages: 2,
      stale: true,
    });
    expect(nodeModulesStaleness(join(root, 'none'))).toBeNull();
  });
});
