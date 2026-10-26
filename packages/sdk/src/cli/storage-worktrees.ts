import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import {
  type CwdLister,
  canonicalPath,
  type Hold,
  holdOwners,
  isBusy,
  isInside,
} from './storage-holds';

/** Merged-clean worktrees must also be idle this long (as #6436 prune). */
export const WORKTREE_MIN_IDLE_DAYS = 1;

export type Git = (cwd: string, args: string[]) => string;
export const realGit: Git = (cwd, args) =>
  // --no-optional-locks keeps status from rewriting indexes it only reads.
  execFileSync('git', ['--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60_000,
  });

const gitOk = (git: Git, cwd: string, args: string[]) => {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
};

export interface WorktreeEntry {
  path: string;
  head: string | null;
  branch: string | null;
  primary: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = {
        path: line.slice(9),
        head: null,
        branch: null,
        primary: entries.length === 0,
        bare: false,
        locked: false,
        prunable: false,
      };
      entries.push(current);
    } else if (!current) continue;
    else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch '))
      current.branch = line.slice(7).replace(/^refs\/heads\//u, '');
    else if (line === 'bare') current.bare = true;
    else if (line.startsWith('locked')) current.locked = true;
    else if (line.startsWith('prunable')) current.prunable = true;
  }
  return entries;
}

/** Pull request facts per branch, from one `gh pr list` per state. */
export interface PullRequestFacts {
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  number: number;
  headRefOid: string;
}
export type PullRequestLookup = (
  repo: string
) => Map<string, PullRequestFacts[]> | null;

export const ghPullRequests: PullRequestLookup = (repo) => {
  try {
    const raw = execFileSync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'all',
        '--limit',
        '1000',
        '--json',
        'headRefName,headRefOid,number,state',
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 60_000,
      }
    );
    const map = new Map<string, PullRequestFacts[]>();
    for (const pr of JSON.parse(raw) as (PullRequestFacts & {
      headRefName: string;
    })[]) {
      const list = map.get(pr.headRefName) ?? [];
      list.push({
        state: pr.state,
        number: pr.number,
        headRefOid: pr.headRefOid,
      });
      map.set(pr.headRefName, list);
    }
    return map;
  } catch {
    return null;
  }
};

export type WorktreeClass =
  | 'primary'
  | 'orphaned'
  | 'dirty'
  | 'unmerged'
  | 'merged-clean';

export interface WorktreeReport {
  repo: string;
  path: string;
  branch: string | null;
  head: string | null;
  classification: WorktreeClass;
  /** Why the classification holds, e.g. `pr #6436 merged at HEAD`. */
  evidence: string;
  dirtyPaths: number;
  locked: boolean;
  current: boolean;
  busy: boolean;
  heldBy: string[];
  owner: string;
  idleDays: number | null;
  pullRequest: PullRequestFacts | null;
  /**
   * Ignored paths outside the rebuildable allowlist (`.env.local`, `tmp/`,
   * coordination notes...). `git worktree remove` deletes ignored files
   * without --force, so any of these fences the worktree.
   */
  ignoredKept: string[];
  /** Never removable by `ttr storage prune`, with the reasons. */
  fences: string[];
}

// Ignored paths `git worktree remove` may delete without asking: rebuildable
// outputs only. Mirrors the artifact patterns in storage-analyze plus
// dependency installs and Rust targets anywhere in the checkout.
const REBUILDABLE_IGNORED = [
  /^\.turbo$/u,
  /^(apps|packages)\/[^/]+\/\.turbo$/u,
  /^apps\/[^/]+\/(\.next|\.open-next|\.dart_tool)$/u,
  /^(apps|packages)\/[^/]+\/(dist|build)$/u,
];

/** True when an ignored path (git `--directory` form) is rebuildable output. */
export function rebuildableIgnored(path: string) {
  const rel = path.replace(/\/+$/u, '');
  const segments = rel.split('/');
  if (segments.includes('node_modules') || segments.includes('target'))
    return true;
  return REBUILDABLE_IGNORED.some((pattern) => pattern.test(rel));
}

/**
 * Ignored, untracked paths in a worktree that are not rebuildable output.
 * Throws if git cannot list them (the caller fences the worktree).
 */
export function ignoredNonRebuildable(git: Git, path: string) {
  return git(path, [
    'ls-files',
    '-z',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--directory',
  ])
    .split('\0')
    .filter(Boolean)
    .filter(
      (entry, _index, all) =>
        // A directory listed above other entries only contains them (git
        // lists ignored files inside it individually): judge the entries.
        !(
          entry.endsWith('/') &&
          all.some((other) => other !== entry && other.startsWith(entry))
        ) && !rebuildableIgnored(entry)
    );
}

/** Owner label from the checkout location (T3 lane, repo `.worktrees`, other). */
export function worktreeOwner(path: string, repo: string) {
  const t3 = join(homedir(), '.t3', 'worktrees') + sep;
  if (path.startsWith(t3)) return `t3:${path.slice(t3.length)}`;
  if (isInside(path, join(repo, '.worktrees'))) return 'repo:.worktrees';
  return 'other';
}

function idleDays(git: Git, path: string, now: number) {
  try {
    const gitDir = git(path, ['rev-parse', '--absolute-git-dir']).trim();
    let newest = 0;
    for (const file of ['index', join('logs', 'HEAD')]) {
      try {
        newest = Math.max(newest, statSync(join(gitDir, file)).mtimeMs);
      } catch {
        // No activity signal from a missing file.
      }
    }
    return newest ? (now - newest) / 86_400_000 : null;
  } catch {
    return null;
  }
}

/**
 * Merged means the exact local HEAD reached the base: either HEAD is an
 * ancestor of `baseRef`, or a merged PR for the branch has HEAD as its head
 * (squash merges). Local commits after the merged head are unmerged work.
 */
export function mergeEvidence(
  git: Git,
  entry: WorktreeEntry,
  baseRef: string,
  prs: Map<string, PullRequestFacts[]> | null
): { merged: boolean; evidence: string; pr: PullRequestFacts | null } {
  const list = entry.branch ? (prs?.get(entry.branch) ?? []) : [];
  const open = list.find((pr) => pr.state === 'OPEN') ?? null;
  if (open)
    return { merged: false, evidence: `pr #${open.number} open`, pr: open };
  const merged = list.find(
    (pr) => pr.state === 'MERGED' && pr.headRefOid === entry.head
  );
  if (merged)
    return {
      merged: true,
      evidence: `pr #${merged.number} merged at HEAD`,
      pr: merged,
    };
  if (
    entry.head &&
    gitOk(git, entry.path, ['merge-base', '--is-ancestor', 'HEAD', baseRef])
  )
    return {
      merged: true,
      evidence: `HEAD is in ${baseRef}`,
      pr: list[0] ?? null,
    };
  const stale = list.find((pr) => pr.state === 'MERGED');
  if (stale)
    return {
      merged: false,
      evidence: `pr #${stale.number} merged at ${stale.headRefOid.slice(0, 12)}, local HEAD differs`,
      pr: stale,
    };
  const closed = list.find((pr) => pr.state === 'CLOSED');
  if (closed)
    return {
      merged: false,
      evidence: `pr #${closed.number} closed unmerged`,
      pr: closed,
    };
  return {
    merged: false,
    evidence: prs
      ? 'no pull request; HEAD not in base'
      : 'PR state unknown (offline); HEAD not in base',
    pr: null,
  };
}

export function classifyWorktrees({
  repo,
  baseRef = 'origin/main',
  holds,
  cwds,
  currentDir = process.cwd(),
  git = realGit,
  prs = null,
  now = Date.now(),
}: {
  repo: string;
  baseRef?: string;
  holds: Hold[];
  cwds: ReturnType<CwdLister>;
  currentDir?: string;
  git?: Git;
  prs?: Map<string, PullRequestFacts[]> | null;
  now?: number;
}): WorktreeReport[] {
  const entries = parseWorktreeList(
    git(repo, ['worktree', 'list', '--porcelain'])
  );
  const primaryPath = entries[0]?.path ?? repo;
  return entries
    .filter((entry) => !entry.bare)
    .map((entry) => {
      const heldBy = holdOwners(entry.path, holds);
      const current = isInside(
        canonicalPath(currentDir),
        canonicalPath(entry.path)
      );
      const base = {
        repo: primaryPath,
        path: entry.path,
        branch: entry.branch,
        head: entry.head,
        locked: entry.locked,
        current,
        heldBy,
        owner: worktreeOwner(entry.path, primaryPath),
      };
      if (entry.prunable || !existsSync(entry.path))
        return {
          ...base,
          classification: 'orphaned' as const,
          evidence: 'directory missing; `git worktree prune` clears the record',
          dirtyPaths: 0,
          ignoredKept: [],
          busy: false,
          idleDays: null,
          pullRequest: null,
          // A missing directory still keeps its hold, lock and preserve fences.
          fences: [
            entry.locked && 'locked',
            heldBy.length && `held by ${heldBy.join(', ')}`,
            entry.branch?.startsWith('preserve/') && 'preserve/* branch',
          ].filter((fence): fence is string => Boolean(fence)),
        };
      const dirtyPaths = git(entry.path, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ])
        .split('\n')
        .filter(Boolean).length;
      let ignoredKept: string[] = [];
      let ignoredError: string | null = null;
      if (!entry.primary)
        try {
          ignoredKept = ignoredNonRebuildable(git, entry.path);
        } catch (error) {
          ignoredError = error instanceof Error ? error.message : String(error);
        }
      const busy = isBusy(entry.path, cwds);
      const proof = mergeEvidence(git, entry, baseRef, prs);
      const classification: WorktreeClass = entry.primary
        ? 'primary'
        : dirtyPaths > 0
          ? 'dirty'
          : proof.merged
            ? 'merged-clean'
            : 'unmerged';
      const fences = [
        entry.primary && 'primary checkout',
        entry.locked && 'locked',
        current && 'current worktree',
        busy && 'process working inside',
        heldBy.length && `held by ${heldBy.join(', ')}`,
        dirtyPaths > 0 && `${dirtyPaths} dirty path(s)`,
        ignoredKept.length > 0 &&
          `${ignoredKept.length} ignored non-rebuildable path(s) git worktree remove would delete: ${ignoredKept.slice(0, 5).join(', ')}${ignoredKept.length > 5 ? ', ...' : ''}`,
        ignoredError &&
          `ignored files could not be listed: ${ignoredError.slice(0, 120)}`,
        !proof.merged && !entry.primary && `unmerged (${proof.evidence})`,
        entry.branch?.startsWith('preserve/') && 'preserve/* branch',
      ].filter((fence): fence is string => Boolean(fence));
      return {
        ...base,
        classification,
        evidence: proof.evidence,
        dirtyPaths,
        ignoredKept,
        busy,
        idleDays: idleDays(git, entry.path, now),
        pullRequest: proof.pr,
        fences,
      };
    });
}

/** Repositories to inspect: explicit roots, else the cwd repo plus resource roots. */
export function discoverRepos({
  roots = [],
  currentDir = process.cwd(),
  git = realGit,
  resourcesHome = process.env.TTR_RESOURCES_HOME ||
    join(homedir(), '.tuturuuu', 'resources'),
}: {
  roots?: string[];
  currentDir?: string;
  git?: Git;
  resourcesHome?: string;
} = {}) {
  const candidates = roots.length
    ? roots.map((root) => resolve(root))
    : [currentDir];
  if (!roots.length) {
    try {
      const config = JSON.parse(
        readFileSync(join(resourcesHome, 'config.json'), 'utf8')
      ) as {
        roots?: unknown;
      };
      if (Array.isArray(config.roots))
        for (const root of config.roots)
          if (typeof root === 'string') candidates.push(root);
    } catch {
      // No resource config: only the current repository.
    }
  }
  const repos = new Map<string, string>();
  for (const candidate of candidates) {
    try {
      const common = git(candidate, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ]).trim();
      const primary = dirname(common);
      repos.set(canonicalPath(common), primary);
    } catch {
      // Not a Git checkout.
    }
  }
  return [...repos.values()];
}

export interface NodeModulesStaleness {
  checkout: string;
  bunEntries: number;
  lockPackages: number;
  stale: boolean;
}

/**
 * Bun's isolated layout keeps one `node_modules/.bun/<name@version>` entry
 * per installed package. Entries far beyond the lockfile's package count are
 * leftovers from older installs that `bun install` never removes; on APFS
 * those diverged clones are private bytes (the main checkout held ~10 GiB).
 */
export function nodeModulesStaleness(
  checkout: string
): NodeModulesStaleness | null {
  const store = join(checkout, 'node_modules', '.bun');
  let bunEntries: number;
  try {
    bunEntries = readdirSync(store).filter(
      (name) => name !== 'node_modules' && !name.startsWith('.')
    ).length;
  } catch {
    return null;
  }
  let lockPackages = 0;
  try {
    const lock = readFileSync(join(checkout, 'bun.lock'), 'utf8');
    // bun.lock is JSON with trailing commas.
    const parsed = JSON.parse(lock.replace(/,(\s*[}\]])/gu, '$1')) as {
      packages?: Record<string, unknown>;
    };
    lockPackages = Object.keys(parsed.packages ?? {}).length;
  } catch {
    return { checkout, bunEntries, lockPackages: 0, stale: false };
  }
  return {
    checkout,
    bunEntries,
    lockPackages,
    stale: lockPackages > 0 && bunEntries > lockPackages * 1.25 + 50,
  };
}
