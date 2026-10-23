import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalPath } from './storage-holds';
import type { PruneContext } from './storage-prune';
import type { StorageCategory } from './storage-targets';
import { classifyWorktrees } from './storage-worktrees';

/** Merged-clean worktrees must also be idle this long (as #6436 prune). */
export const WORKTREE_MIN_IDLE_DAYS = 1;

export function worktreeSteps(ctx: PruneContext, category: StorageCategory) {
  const {
    report,
    options,
    steps,
    push,
    fenced,
    command,
    wanted,
    git,
    exec,
    now,
  } = ctx;
  for (const worktree of report.worktrees) {
    if (!wanted(worktree.path)) continue;
    if (worktree.classification === 'orphaned') {
      // A record for a missing directory: no files, so holds/busy do not apply.
      push({
        category,
        path: `git-record:${worktree.path}`,
        bytes: 0,
        description: `git -C ${worktree.repo} worktree prune`,
        run: command(['git', '-C', worktree.repo, 'worktree', 'prune']),
      });
      continue;
    }
    if (worktree.classification !== 'merged-clean' || worktree.fences.length) {
      if (worktree.classification !== 'primary')
        steps.push({
          category,
          path: worktree.path,
          bytes: worktree.uniqueBytes,
          description: 'keep worktree',
          status: 'skipped',
          reason: worktree.fences.join('; ') || worktree.classification,
        });
      continue;
    }
    if ((worktree.idleDays ?? 0) < WORKTREE_MIN_IDLE_DAYS) {
      steps.push({
        category,
        path: worktree.path,
        bytes: worktree.uniqueBytes,
        description: 'keep worktree',
        status: 'skipped',
        reason: `recently active (idle < ${WORKTREE_MIN_IDLE_DAYS}d)`,
      });
      continue;
    }
    push({
      category,
      path: worktree.path,
      bytes: worktree.uniqueBytes,
      description: `git worktree remove; git branch -d ${worktree.branch ?? '(detached)'} (${worktree.evidence})`,
      run: fenced(worktree.path, () => {
        // Re-classify from scratch: still clean, same HEAD, still merged.
        const fresh = classifyWorktrees({
          repo: worktree.repo,
          holds: options.holds(),
          cwds: options.cwds(),
          git,
          prs: options.prs(worktree.repo),
          now,
        }).find((entry) => entry.path === worktree.path);
        if (
          fresh?.classification !== 'merged-clean' ||
          fresh.fences.length ||
          fresh.head !== worktree.head
        )
          return `re-check failed: ${fresh ? `${fresh.classification} ${fresh.fences.join('; ')}`.trim() : 'worktree vanished'}`;
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
        if (worktree.branch && !worktree.branch.startsWith('preserve/')) {
          // -d only: git keeps a branch it does not see as merged (squash merges).
          const branch = exec([
            'git',
            '-C',
            worktree.repo,
            'branch',
            '-d',
            worktree.branch,
          ]);
          if (branch.status !== 0)
            return `worktree removed; branch ${worktree.branch} kept (git branch -d: ${branch.stderr.trim().split('\n')[0]})`;
        }
        return null;
      }),
    });
  }
}

export function nodeModulesSteps(ctx: PruneContext, category: StorageCategory) {
  const { report, options, steps, push, fenced, command, remove } = ctx;
  const checkout = resolve(options.paths[0]!);
  const item = report.items.find(
    (entry) =>
      entry.category === category &&
      entry.worktree &&
      canonicalPath(entry.worktree) === canonicalPath(checkout)
  );
  if (!item) {
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
  push({
    category,
    path: checkout,
    bytes: item.uniqueBytes,
    description:
      'remove node_modules, then ttr resources run -- bun install --frozen-lockfile',
    run: fenced(checkout, () => {
      if (!existsSync(join(checkout, 'bun.lock')))
        return 'no bun.lock in checkout';
      if (!lstatSync(modules, { throwIfNoEntry: false })?.isDirectory())
        return 'node_modules is not a directory';
      remove(modules);
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
        checkout
      )();
    }),
  });
}

export function buildArtifactSteps(
  ctx: PruneContext,
  category: StorageCategory
) {
  const {
    report,
    steps,
    push,
    command,
    items,
    wanted,
    olderThanDays,
    maxRemoveBytes,
  } = ctx;
  // Pruning is owned by `bun worktree:prune-artifacts` (#6436); pass only
  // worktrees that clear every fence here, so all hold files apply.
  const byRepo = new Map<string, string[]>();
  for (const worktree of report.worktrees)
    if (
      worktree.classification === 'merged-clean' &&
      !worktree.fences.length &&
      wanted(worktree.path) &&
      items(category).some((item) => item.worktree === worktree.path)
    )
      byRepo.set(worktree.repo, [
        ...(byRepo.get(worktree.repo) ?? []),
        worktree.path,
      ]);
  for (const [repo, worktrees] of byRepo) {
    const script = join(repo, 'scripts', 'worktree-footprint.js');
    const bytes = items(category)
      .filter((item) => worktrees.includes(item.worktree ?? ''))
      .reduce((sum, item) => sum + item.uniqueBytes, 0);
    if (!existsSync(script)) {
      steps.push({
        category,
        path: repo,
        bytes,
        description: 'bun worktree:prune-artifacts',
        status: 'skipped',
        reason: 'scripts/worktree-footprint.js not in this checkout yet',
      });
      continue;
    }
    const argv = [
      'node',
      script,
      'prune',
      '--apply',
      '--min-idle-hours',
      String(olderThanDays * 24),
      '--max-remove',
      String(Math.max(1, maxRemoveBytes - ctx.planned())),
      ...worktrees.flatMap((path) => ['--worktree', path]),
    ];
    push({
      category,
      path: repo,
      bytes,
      description: `bun worktree:prune-artifacts --apply for ${worktrees.length} worktree(s)`,
      run: command(argv, repo),
    });
  }
}

export function rustTargetSteps(ctx: PruneContext, category: StorageCategory) {
  const { push, fenced, command, items, olderThanDays } = ctx;
  for (const item of items(category)) {
    const script = join(item.worktree ?? '', 'scripts', 'rust-cache.js');
    if (!existsSync(script)) continue;
    push({
      category,
      path: item.path,
      bytes: item.uniqueBytes,
      description: `bun rust-cache prune (age ${olderThanDays}d)`,
      run: fenced(
        item.path,
        command(
          [
            'node',
            script,
            'prune',
            '--apply',
            '--target',
            item.path,
            '--max-age-days',
            String(olderThanDays),
          ],
          item.worktree
        )
      ),
    });
  }
}
