import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalPath } from './storage-holds';
import type { PruneContext, StepResult } from './storage-prune';
import type { StorageCategory } from './storage-targets';
import {
  classifyWorktrees,
  WORKTREE_MIN_IDLE_DAYS,
  type WorktreeReport,
} from './storage-worktrees';

type Fresh = ReturnType<typeof classifyWorktrees>[number];

/**
 * Re-classifies a worktree from scratch (fresh holds, cwds, PR state) right
 * before acting. The HEAD and branch must be unchanged and `allow` must pass.
 */
function recheck(
  ctx: PruneContext,
  worktree: WorktreeReport,
  allow: (fresh: Fresh) => string | null
): string | null {
  const fresh = classifyWorktrees({
    repo: worktree.repo,
    holds: ctx.options.holds(),
    cwds: ctx.options.cwds(),
    git: ctx.git,
    prs: ctx.options.prs(worktree.repo),
    now: ctx.now,
  }).find((entry) => entry.path === worktree.path);
  if (!fresh) return 're-check failed: worktree vanished';
  if (fresh.head !== worktree.head || fresh.branch !== worktree.branch)
    return 're-check failed: HEAD or branch changed since planning';
  return allow(fresh);
}

const mergedCleanIdle = (fresh: Fresh) =>
  fresh.classification === 'merged-clean' &&
  !fresh.fences.length &&
  (fresh.idleDays ?? 0) >= WORKTREE_MIN_IDLE_DAYS
    ? null
    : `re-check failed: ${fresh.classification} ${fresh.fences.join('; ')}`.trim();

/** Fence-clear, merged, idle worktrees: the only ones whose files are touched. */
function removable(ctx: PruneContext, worktree: WorktreeReport) {
  return (
    ctx.wanted(worktree.path) &&
    worktree.classification === 'merged-clean' &&
    !worktree.fences.length &&
    (worktree.idleDays ?? 0) >= WORKTREE_MIN_IDLE_DAYS
  );
}

export function worktreeSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, steps, push, fenced, command, wanted, exec } = ctx;
  const orphansByRepo = new Map<string, WorktreeReport[]>();
  for (const worktree of report.worktrees) {
    if (worktree.classification === 'orphaned') {
      orphansByRepo.set(worktree.repo, [
        ...(orphansByRepo.get(worktree.repo) ?? []),
        worktree,
      ]);
      continue;
    }
    if (!wanted(worktree.path) || worktree.classification === 'primary')
      continue;
    if (!removable(ctx, worktree)) {
      steps.push({
        category,
        path: worktree.path,
        bytes: worktree.uniqueBytes,
        description: 'keep worktree',
        status: 'skipped',
        reason:
          worktree.fences.join('; ') ||
          (worktree.classification === 'merged-clean'
            ? `recently active (idle < ${WORKTREE_MIN_IDLE_DAYS}d)`
            : worktree.classification),
      });
      continue;
    }
    push({
      category,
      path: worktree.path,
      bytes: worktree.uniqueBytes,
      description: `git worktree remove; git branch -d ${worktree.branch ?? '(detached)'} (${worktree.evidence})`,
      run: fenced(worktree.path, () => {
        const failed = recheck(ctx, worktree, mergedCleanIdle);
        if (failed) return failed;
        // No --force: git refuses untracked or modified files itself.
        const removed = exec([
          'git',
          '-C',
          worktree.repo,
          'worktree',
          'remove',
          worktree.path,
        ]);
        if (removed.status !== 0)
          return `git worktree remove: ${removed.stderr.trim()}`;
        if (!worktree.branch || worktree.branch.startsWith('preserve/'))
          return null;
        // -d only: git keeps a branch it does not see as merged (squash
        // merges). That is the expected outcome, not a failure.
        const branch = exec([
          'git',
          '-C',
          worktree.repo,
          'branch',
          '-d',
          worktree.branch,
        ]);
        return branch.status === 0
          ? null
          : {
              note: `worktree removed; branch ${worktree.branch} kept (git branch -d refused; delete it after checking the PR)`,
            };
      }),
    });
  }
  // `git worktree prune` is repo-wide, so it runs only when every missing
  // record in that repo is wanted and unheld (git itself keeps locked ones).
  for (const [repo, orphans] of orphansByRepo) {
    const blocked = orphans.find(
      (orphan) => !wanted(orphan.path) || orphan.fences.length
    );
    if (blocked) {
      if (orphans.some((orphan) => wanted(orphan.path)))
        steps.push({
          category,
          path: `git-records:${repo}`,
          bytes: 0,
          description: `git -C ${repo} worktree prune`,
          status: 'skipped',
          reason: `record for ${blocked.path} is ${blocked.fences.join('; ') || 'outside --path'}`,
        });
      continue;
    }
    push({
      category,
      path: `git-records:${repo}`,
      fencePaths: orphans.map((orphan) => orphan.path),
      bytes: 0,
      description: `git -C ${repo} worktree prune (${orphans.length} missing record(s))`,
      run: fenced(
        orphans.map((orphan) => orphan.path),
        command(['git', '-C', repo, 'worktree', 'prune'])
      ),
    });
  }
}

export function nodeModulesSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, options, steps, push, command, removeTree } = ctx;
  const checkout = resolve(options.paths[0]!);
  const item = report.items.find(
    (entry) =>
      entry.category === category &&
      entry.worktree &&
      canonicalPath(entry.worktree) === canonicalPath(checkout)
  );
  const worktree = report.worktrees.find(
    (entry) => canonicalPath(entry.path) === canonicalPath(checkout)
  );
  if (!item || !worktree) {
    steps.push({
      category,
      path: checkout,
      bytes: 0,
      description: 'reinstall node_modules',
      status: 'skipped',
      reason: 'node_modules is not stale or not found in this report',
    });
    return;
  }
  const modules = join(checkout, 'node_modules');
  // Dirty or unmerged source is fine (node_modules is rebuildable); a lock,
  // a hold, the current checkout or a working process is not.
  const blocking = (fences: string[]) =>
    fences.filter((fence) =>
      /^(locked|current worktree|process working inside|held by)/u.test(fence)
    );
  push({
    category,
    path: checkout,
    bytes: item.uniqueBytes,
    description:
      'remove node_modules, then ttr resources run -- bun install --frozen-lockfile',
    run: (): StepResult => {
      const removed = removeTree(
        checkout,
        modules,
        () => {
          const failed = recheck(ctx, worktree, (fresh) =>
            blocking(fresh.fences).length
              ? `re-check failed: ${blocking(fresh.fences).join('; ')}`
              : null
          );
          if (failed) return failed;
          if (!existsSync(join(checkout, 'bun.lock')))
            return 'no bun.lock in checkout';
          if (!lstatSync(modules, { throwIfNoEntry: false })?.isDirectory())
            return 'node_modules is not a directory';
          return null;
        },
        [checkout]
      )();
      if (removed !== null) return removed;
      // The disk gate must not strand a checkout whose node_modules was just
      // removed to free space.
      return command(
        [
          ...(options.ttrArgv ?? ['ttr']),
          'resources',
          'run',
          '--',
          'bun',
          'install',
          '--frozen-lockfile',
        ],
        checkout,
        { TTR_RESOURCES_IGNORE_DISK: '1' }
      )();
    },
  });
}

export function buildArtifactSteps(
  ctx: PruneContext,
  category: StorageCategory
) {
  const { report, steps, push, fenced, command, items, olderThanDays } = ctx;
  // Pruning is owned by `bun worktree:prune-artifacts` (#6436). One step per
  // fence-clear worktree, re-verified here because that script reads only
  // one holds file and no process cwds.
  for (const worktree of report.worktrees) {
    const artifacts = items(category).filter(
      (item) => item.worktree === worktree.path
    );
    if (!artifacts.length || !removable(ctx, worktree)) continue;
    const bytes = artifacts.reduce((sum, item) => sum + item.uniqueBytes, 0);
    const script = join(worktree.repo, 'scripts', 'worktree-footprint.js');
    if (!existsSync(script)) {
      steps.push({
        category,
        path: worktree.path,
        bytes,
        description: 'bun worktree:prune-artifacts',
        status: 'skipped',
        reason: 'scripts/worktree-footprint.js not in the primary checkout',
      });
      continue;
    }
    push({
      category,
      path: worktree.path,
      bytes,
      description: 'bun worktree:prune-artifacts --apply',
      run: fenced(worktree.path, () => {
        const failed = recheck(ctx, worktree, mergedCleanIdle);
        if (failed) return failed;
        return command(
          [
            // The absolute runtime running ttr, never `node` from PATH.
            process.execPath,
            script,
            'prune',
            '--apply',
            '--min-idle-hours',
            String(olderThanDays * 24),
            '--max-remove',
            String(Math.max(1, bytes)),
            '--worktree',
            worktree.path,
          ],
          worktree.repo
        )();
      }),
    });
  }
}

export function rustTargetSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, push, fenced, command, items, olderThanDays } = ctx;
  for (const item of items(category)) {
    const worktree = report.worktrees.find(
      (entry) => entry.path === item.worktree
    );
    if (!worktree || !removable(ctx, worktree)) continue;
    // The primary checkout's script: never execute code from the target tree.
    const script = join(worktree.repo, 'scripts', 'rust-cache.js');
    if (!existsSync(script)) continue;
    push({
      category,
      path: item.path,
      fencePaths: [worktree.path],
      bytes: item.uniqueBytes,
      description: `bun rust-cache prune (age ${olderThanDays}d)`,
      run: fenced(worktree.path, () => {
        const failed = recheck(ctx, worktree, mergedCleanIdle);
        if (failed) return failed;
        return command(
          [
            // The absolute runtime running ttr, never `node` from PATH.
            process.execPath,
            script,
            'prune',
            '--apply',
            '--target',
            item.path,
            '--max-age-days',
            String(olderThanDays),
          ],
          worktree.repo
        )();
      }),
    });
  }
}
