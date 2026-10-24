import { lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findArtifacts } from './storage-analyze';
import { canonicalPath, type Hold, isInside } from './storage-holds';
import { commandRunning, type Liveness } from './storage-liveness';
import type { Measurer } from './storage-measure';
import { containsGitRepository } from './storage-scratch';
import { newestMtime } from './storage-targets';
import {
  classifyWorktrees,
  discoverRepos,
  type Git,
  type PullRequestLookup,
  WORKTREE_MIN_IDLE_DAYS,
} from './storage-worktrees';

/**
 * The only rules automatic reclaim may run: path-bounded regenerable caches
 * and completed, unowned build output, each removed as one verified
 * directory tree, so the deleted set is exactly the checked set. Command-based
 * cleanups (Homebrew, npm, Docker, simulators) are not path-bounded and stay
 * manual suggestions, as do worktrees, node_modules, Bun/pub caches, tmp,
 * evidence, databases, volumes and VM disks. Narrow with
 * TTR_STORAGE_AUTO_RECLAIM_RULES.
 */
export const AUTO_RECLAIM_RULES = [
  'xcode-derived-data-idle',
  'merged-worktree-artifact',
] as const;
export type ReclaimRule = (typeof AUTO_RECLAIM_RULES)[number];

export interface ReclaimCandidate {
  rule: ReclaimRule;
  /** Absolute directory removed as one verified tree. */
  path: string;
  /** Rule root the path must stay strictly inside (identity anchor). */
  root: string;
  /** Measured before acting. */
  bytes: number;
  owner: string;
  /** Paths whose holds, cwds and open files are checked before acting. */
  scopePaths: string[];
  /** Rule-specific re-check right before acting; a reason when ineligible. */
  recheck: () => string | null;
}

export interface PlanDeps {
  holds: () => Hold[];
  liveness: Liveness;
  measure: Measurer;
  git: Git;
  prs: PullRequestLookup;
  repos?: string[];
  olderThanDays: number;
  now: number;
  home?: string;
  platform?: NodeJS.Platform;
  rules?: readonly ReclaimRule[];
  /** Device of the low volume: candidates elsewhere free nothing there. */
  device?: number | null;
  deviceOf?: (path: string) => number;
}

/** Xcode or xcodebuild may be writing DerivedData. */
export const XCODE_BUSY = /\bxcodebuild\b|Xcode\.app\/Contents\/MacOS\/Xcode/u;

export function enabledRules(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TTR_STORAGE_AUTO_RECLAIM_RULES?.trim();
  if (!raw) return [...AUTO_RECLAIM_RULES];
  const wanted = raw.split(',').map((rule) => rule.trim());
  return AUTO_RECLAIM_RULES.filter((rule) => wanted.includes(rule));
}

const sizeOf = (measure: Measurer, path: string) =>
  measure([{ root: path }]).results[0]?.uniqueBytes ?? 0;

const children = (path: string) => {
  try {
    return readdirSync(path)
      .map((name) => join(path, name))
      .filter((child) => {
        const info = lstatSync(child, { throwIfNoEntry: false });
        return info?.isDirectory() && !info.isSymbolicLink();
      });
  } catch {
    return [];
  }
};

/** Candidates in the order they are tried: cheapest to rebuild first. */
export function planReclaim(input: PlanDeps): ReclaimCandidate[] {
  // PR facts are fetched once per repo per run, then reused by re-checks.
  const facts = new Map<string, ReturnType<PlanDeps['prs']>>();
  const deps: PlanDeps = {
    ...input,
    prs: (repo) => {
      if (!facts.has(repo)) facts.set(repo, input.prs(repo));
      return facts.get(repo) ?? null;
    },
  };
  const home = deps.home ?? homedir();
  const rules = new Set(deps.rules ?? AUTO_RECLAIM_RULES);
  const cutoff = deps.now - deps.olderThanDays * 86_400_000;
  const mac = (deps.platform ?? process.platform) === 'darwin';
  const candidates: ReclaimCandidate[] = [];

  const xcodeRunning = () => commandRunning(deps.liveness, XCODE_BUSY);
  if (mac && rules.has('xcode-derived-data-idle') && !xcodeRunning()) {
    const root = join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');
    for (const child of children(root)) {
      if (newestMtime(child) > cutoff) continue;
      candidates.push({
        rule: 'xcode-derived-data-idle',
        path: child,
        root,
        bytes: sizeOf(deps.measure, child),
        owner: 'machine user (Xcode build cache)',
        scopePaths: [child],
        recheck: () =>
          xcodeRunning()
            ? 'Xcode or xcodebuild is running'
            : newestMtime(child) > cutoff
              ? 'written since planning'
              : null,
      });
    }
  }

  if (rules.has('merged-worktree-artifact'))
    for (const repo of deps.repos ?? discoverRepos({ git: deps.git })) {
      let cwds: ReturnType<Liveness['cwds']>;
      try {
        // Hidden foreign processes are handled by the private-tree proof at
        // removal time; this user's processes must all be visible.
        cwds = deps.liveness.scan
          ? deps.liveness.scan().cwds
          : deps.liveness.cwds();
      } catch {
        break; // Without a cwd scan no worktree is provably unowned.
      }
      const prs = deps.prs(repo);
      for (const worktree of classifyWorktrees({
        repo,
        holds: deps.holds(),
        cwds,
        git: deps.git,
        prs,
        now: deps.now,
      })) {
        if (
          worktree.classification !== 'merged-clean' ||
          worktree.fences.length ||
          (worktree.idleDays ?? 0) < WORKTREE_MIN_IDLE_DAYS
        )
          continue;
        for (const artifact of findArtifacts(worktree.path, deps.git)) {
          if (newestMtime(artifact) > cutoff) continue;
          candidates.push({
            rule: 'merged-worktree-artifact',
            path: artifact,
            bytes: sizeOf(deps.measure, artifact),
            owner: `${worktree.owner} (merged ${worktree.branch ?? worktree.head?.slice(0, 12)})`,
            root: worktree.path,
            scopePaths: [worktree.path],
            recheck: () => {
              const fresh = classifyWorktrees({
                repo,
                holds: deps.holds(),
                cwds: deps.liveness.scan
                  ? deps.liveness.scan().cwds
                  : deps.liveness.cwds(),
                git: deps.git,
                prs: deps.prs(repo),
                now: Date.now(),
              }).find((entry) => entry.path === worktree.path);
              if (
                fresh?.classification !== 'merged-clean' ||
                fresh.fences.length ||
                fresh.head !== worktree.head ||
                fresh.branch !== worktree.branch
              )
                return `worktree re-check failed: ${fresh ? `${fresh.classification} ${fresh.fences.join('; ')}` : 'vanished'}`;
              if (
                !findArtifacts(worktree.path, deps.git).some(
                  (path) => canonicalPath(path) === canonicalPath(artifact)
                )
              )
                return 'no longer an ignored, untracked artifact';
              return newestMtime(artifact) > cutoff
                ? 'written since planning'
                : null;
            },
          });
        }
      }
    }

  // Never act outside the rule's root or off the low volume.
  const deviceOf = deps.deviceOf ?? ((path: string) => lstatSync(path).dev);
  return candidates.filter((candidate) => {
    if (containsGitRepository(candidate.path)) return false;
    if (!isInside(canonicalPath(candidate.path), canonicalPath(candidate.root)))
      return false;
    if (deps.device === undefined) return true;
    try {
      return deps.device !== null && deviceOf(candidate.path) === deps.device;
    } catch {
      return false;
    }
  });
}
