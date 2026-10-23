import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import type { StorageItem, StorageReport } from './storage-analyze';
import { formatBytes, GiB } from './storage-headroom';
import {
  type CwdLister,
  canonicalPath,
  type Hold,
  holdOwners,
  isBusy,
  isInside,
} from './storage-holds';
import {
  buildArtifactSteps,
  nodeModulesSteps,
  rustTargetSteps,
  worktreeSteps,
} from './storage-prune-checkouts';
import {
  cacheCommandSteps,
  derivedDataSteps,
  dockerSteps,
  supabaseVolumeSteps,
  tmpSteps,
} from './storage-prune-machine';
import type { StorageCategory } from './storage-targets';
import { type Git, type PullRequestLookup, realGit } from './storage-worktrees';

/** Applied by a plain `prune --apply`: rebuildable, stateless, bounded. */
export const AUTO_CATEGORIES: StorageCategory[] = [
  'build-artifacts',
  'rust-target',
  'xcode-derived-data',
  'xcode-simulators',
  'homebrew-cache',
  'docker',
];
/** Applied only when named with `--category`. */
export const NAMED_CATEGORIES: StorageCategory[] = [
  'worktrees',
  'node-modules-stale',
  'npm-cache',
  'bun-cache',
  'pub-cache',
  'tmp-old',
  'supabase-volumes',
];

export type Exec = (
  argv: string[],
  cwd?: string
) => { status: number | null; stdout: string; stderr: string };
export const realExec: Exec = (argv, cwd) => {
  const result = spawnSync(argv[0]!, argv.slice(1), {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.error ? 127 : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
  };
};

export interface PruneStep {
  category: StorageCategory;
  path: string;
  bytes: number;
  description: string;
  status: 'planned' | 'done' | 'skipped' | 'failed';
  reason?: string;
  /** Runs the step after re-verifying its fences; returns a failure reason or null. */
  run?: () => string | null;
}

export interface PruneOptions {
  report: StorageReport;
  apply: boolean;
  categories: StorageCategory[] | null;
  olderThanDays: number;
  maxRemoveBytes: number;
  paths: string[];
  names: string[];
  holds: () => Hold[];
  cwds: CwdLister;
  git?: Git;
  prs: PullRequestLookup;
  exec?: Exec;
  remove?: (path: string) => void;
  ttrArgv?: string[];
  now?: number;
}

export interface PruneContext {
  report: StorageReport;
  options: PruneOptions;
  steps: PruneStep[];
  /** Adds a step unless a hold, a busy process or the size bound skips it. */
  push: (step: Omit<PruneStep, 'status'>) => void;
  /** Wraps an action so holds and live cwds are re-read right before it runs. */
  fenced: (path: string, action: () => string | null) => () => string | null;
  command: (argv: string[], cwd?: string) => () => string | null;
  items: (category: StorageCategory) => StorageItem[];
  wanted: (path: string) => boolean;
  cutoff: number;
  olderThanDays: number;
  maxRemoveBytes: number;
  git: Git;
  exec: Exec;
  remove: (path: string) => void;
  now: number;
  planned: () => number;
}

const builders: Partial<
  Record<
    StorageCategory,
    (ctx: PruneContext, category: StorageCategory) => void
  >
> = {
  worktrees: worktreeSteps,
  'node-modules-stale': nodeModulesSteps,
  'build-artifacts': buildArtifactSteps,
  'rust-target': rustTargetSteps,
  'xcode-derived-data': derivedDataSteps,
  'tmp-old': tmpSteps,
  'supabase-volumes': supabaseVolumeSteps,
  docker: dockerSteps,
  'xcode-simulators': cacheCommandSteps,
  'homebrew-cache': cacheCommandSteps,
  'npm-cache': cacheCommandSteps,
  'bun-cache': cacheCommandSteps,
  'pub-cache': cacheCommandSteps,
};

const forceRemove = (path: string) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 2 });

/**
 * Builds the plan from a fresh report, then (with apply) re-reads holds and
 * process cwds and re-verifies each step immediately before acting.
 */
export function pruneStorage(options: PruneOptions) {
  const {
    report,
    apply,
    olderThanDays,
    maxRemoveBytes,
    git = realGit,
    exec = realExec,
    remove = forceRemove,
    now = Date.now(),
  } = options;
  const requested = options.categories ?? AUTO_CATEGORIES;
  const manual = requested.filter(
    (category) =>
      !AUTO_CATEGORIES.includes(category) &&
      !NAMED_CATEGORIES.includes(category)
  );
  if (manual.length)
    throw new Error(
      `${manual.join(', ')} ${manual.length > 1 ? 'are' : 'is'} reported only; see ttr storage suggest for the manual command.`
    );
  if (requested.includes('node-modules-stale') && options.paths.length !== 1)
    throw new Error('node-modules-stale needs exactly one --path <checkout>.');
  if (requested.includes('supabase-volumes') && !options.names.length)
    throw new Error(
      'supabase-volumes needs --name <volume> for each volume to remove.'
    );

  const cutoff = now - olderThanDays * 86_400_000;
  const holds = options.holds();
  const cwds = options.cwds();
  const steps: PruneStep[] = [];
  let planned = 0;
  const wanted = (path: string) =>
    !options.paths.length ||
    options.paths.some((entry) =>
      isInside(canonicalPath(path), canonicalPath(entry))
    );
  const push = (step: Omit<PruneStep, 'status'>): void => {
    const held = step.path.startsWith('/') ? holdOwners(step.path, holds) : [];
    if (held.length)
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: `held by ${held.join(', ')}`,
        run: undefined,
      });
    if (step.path.startsWith('/') && isBusy(step.path, cwds))
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: 'a process is working inside',
        run: undefined,
      });
    if (planned + step.bytes > maxRemoveBytes)
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: `over --max-remove ${formatBytes(maxRemoveBytes)}`,
        run: undefined,
      });
    planned += step.bytes;
    steps.push({ ...step, status: 'planned' });
  };
  // Every destructive closure re-checks holds and live cwds first.
  const fenced = (path: string, action: () => string | null) => () => {
    const held = holdOwners(path, options.holds());
    if (held.length) return `held by ${held.join(', ')}`;
    if (isBusy(path, options.cwds())) return 'a process is working inside';
    return action();
  };
  const command = (argv: string[], cwd?: string) => () => {
    const result = exec(argv, cwd);
    return result.status === 0
      ? null
      : `${argv.join(' ')} exited ${result.status}: ${result.stderr.trim().slice(0, 300)}`;
  };
  const items = (category: StorageCategory) =>
    report.items.filter(
      (item) => item.category === category && wanted(item.path)
    );

  const ctx: PruneContext = {
    report,
    options,
    steps,
    push,
    fenced,
    command,
    items,
    wanted,
    cutoff,
    olderThanDays,
    maxRemoveBytes,
    git,
    exec,
    remove,
    now,
    planned: () => planned,
  };
  for (const category of requested) builders[category]?.(ctx, category);

  if (apply)
    for (const step of steps) {
      if (step.status !== 'planned' || !step.run) continue;
      try {
        const failure = step.run();
        step.status = failure ? 'failed' : 'done';
        if (failure) step.reason = failure;
      } catch (error) {
        step.status = 'failed';
        step.reason = error instanceof Error ? error.message : String(error);
      }
    }
  return {
    apply,
    olderThanDays,
    maxRemoveBytes,
    plannedBytes: planned,
    steps: steps.map(({ run: _run, ...step }) => step),
  };
}

export const defaultMaxRemoveBytes = 20 * GiB;
