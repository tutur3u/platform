import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
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
  checkPathIdle,
  type IdleLiveness,
  type ProcessScan,
} from './storage-liveness';
import { type Measurer, measureTrees } from './storage-measure';
import type { PrivacyProof } from './storage-privacy';
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
  simulatorSteps,
  supabaseVolumeSteps,
  tmpSteps,
} from './storage-prune-machine';
import {
  captureIdentity,
  removeVerifiedTree,
  type TreeIdentity,
} from './storage-safe-remove';
import type { StorageCategory } from './storage-targets';
import { type Git, type PullRequestLookup, realGit } from './storage-worktrees';

/** Applied by a plain `prune --apply`: rebuildable, stateless, bounded. */
export const AUTO_CATEGORIES: StorageCategory[] = [
  'build-artifacts',
  'rust-target',
  'xcode-derived-data',
  'xcode-simulators',
];
/**
 * Applied only when named with `--category`. Homebrew cleanup also removes
 * old formula versions and Docker prunes are not path-bounded, so neither is
 * part of a plain `prune --apply`.
 */
export const NAMED_CATEGORIES: StorageCategory[] = [
  'homebrew-cache',
  'docker',
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
  cwd?: string,
  env?: NodeJS.ProcessEnv
) => { status: number | null; stdout: string; stderr: string };
export const realExec: Exec = (argv, cwd, env) => {
  const result = spawnSync(argv[0]!, argv.slice(1), {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
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
  /** Every path the step touches; holds and busy checks cover all of them. */
  fencePaths?: string[];
  /** Rule root for the private-tree proof (default: each path's parent). */
  root?: string;
  /** Runs the step after re-verifying its fences. */
  run?: () => StepResult;
}

/** A failure reason, null for success, or success with a note. */
export type StepResult = string | null | { note: string };

export interface PruneOptions {
  report: StorageReport;
  apply: boolean;
  categories: StorageCategory[] | null;
  olderThanDays: number;
  maxRemoveBytes: number;
  paths: string[];
  names: string[];
  holds: () => Hold[];
  /** Strict cwd scan: throws unless every process could be inspected. */
  cwds: CwdLister;
  /** Open files under a path (lsof +D); see storage-liveness. */
  openFiles: IdleLiveness['openFiles'];
  /**
   * Process scan that may report hidden foreign processes (macOS, non-root);
   * each path then needs a private-tree proof from `privacy`.
   */
  scan?: () => ProcessScan;
  privacy?: (path: string, root: string) => PrivacyProof;
  git?: Git;
  prs: PullRequestLookup;
  exec?: Exec;
  /** Removes a tree whose identity was captured before the checks ran. */
  removeTree?: (identity: TreeIdentity) => void;
  measure?: Measurer;
  ttrArgv?: string[];
  now?: number;
  env?: NodeJS.ProcessEnv;
  /** Whether a path is an existing unix socket (local Docker check). */
  isSocket?: (path: string) => boolean;
}

export interface PruneContext {
  report: StorageReport;
  options: PruneOptions;
  steps: PruneStep[];
  /** Adds a step unless a hold, a busy process or the size bound skips it. */
  push: (step: Omit<PruneStep, 'status'>) => void;
  /**
   * Wraps an action so holds, live cwds and open files are re-checked right
   * before it runs; any failed or erroring check skips the action.
   */
  fenced: (
    paths: string | string[],
    action: () => StepResult
  ) => () => StepResult;
  /**
   * Removes `target` (strictly inside `root`): its directory identity is
   * captured first, then the fences and `recheck` run, then the tree is
   * removed only if that identity still holds.
   */
  removeTree: (
    root: string,
    target: string,
    recheck?: () => string | null,
    fencePaths?: string[],
    options?: { refuseRepositories?: boolean }
  ) => () => StepResult;
  command: (
    argv: string[],
    cwd?: string,
    env?: NodeJS.ProcessEnv
  ) => () => StepResult;
  items: (category: StorageCategory) => StorageItem[];
  wanted: (path: string) => boolean;
  cutoff: number;
  olderThanDays: number;
  maxRemoveBytes: number;
  git: Git;
  exec: Exec;
  env: NodeJS.ProcessEnv;
  measure: Measurer;
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
  'xcode-simulators': simulatorSteps,
  'homebrew-cache': cacheCommandSteps,
  'npm-cache': cacheCommandSteps,
  'bun-cache': cacheCommandSteps,
  'pub-cache': cacheCommandSteps,
};

const verifiedRemove = (identity: TreeIdentity) => {
  removeVerifiedTree(identity);
};

/**
 * Builds the plan from a fresh report, then (with apply) re-reads holds,
 * process cwds and open files and re-verifies each step immediately before
 * acting.
 */
export function pruneStorage(options: PruneOptions) {
  const {
    report,
    apply,
    olderThanDays,
    maxRemoveBytes,
    git = realGit,
    exec = realExec,
    removeTree = verifiedRemove,
    measure = measureTrees,
    now = Date.now(),
    env = process.env,
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
  // Without complete process visibility no path is provably unused: path
  // steps are planned as skipped with the reason, and apply re-checks anyway.
  let cwds: ReturnType<CwdLister> = [];
  let blind: string | null = null;
  let hidden: ProcessScan['hidden'] = [];
  try {
    const scan = options.scan
      ? options.scan()
      : { cwds: options.cwds(), hidden: [] };
    cwds = scan.cwds;
    hidden = scan.hidden;
  } catch (error) {
    blind = `cwd scan failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const liveness: IdleLiveness = {
    cwds: options.cwds,
    openFiles: options.openFiles,
    scan: options.scan,
    privacy: options.privacy,
  };
  const steps: PruneStep[] = [];
  let planned = 0;
  const wanted = (path: string) =>
    !options.paths.length ||
    options.paths.some((entry) =>
      isInside(canonicalPath(path), canonicalPath(entry))
    );
  const absolute = (step: Omit<PruneStep, 'status'>) =>
    (step.fencePaths ?? [step.path]).filter((path) => path.startsWith('/'));
  const push = (step: Omit<PruneStep, 'status'>): void => {
    const paths = absolute(step);
    const held = [...new Set(paths.flatMap((path) => holdOwners(path, holds)))];
    if (held.length)
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: `held by ${held.join(', ')}`,
        run: undefined,
      });
    if (paths.length && blind)
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: blind,
        run: undefined,
      });
    // Hidden foreign processes: plan only paths with a private-tree proof.
    const unproven = hidden.length
      ? paths
          .map((path) => ({
            path,
            proof: options.privacy?.(path, step.root ?? dirname(path)),
          }))
          .find((entry) => !entry.proof?.ok)
      : undefined;
    if (unproven)
      return void steps.push({
        ...step,
        status: 'skipped',
        reason: `${hidden.length} process(es) of other users cannot be inspected and ${unproven.path} is not provably private${unproven.proof && !unproven.proof.ok ? `: ${unproven.proof.reason}` : ''}`,
        run: undefined,
      });
    if (paths.some((path) => isBusy(path, cwds)))
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
  // Every destructive closure re-checks holds, live cwds and open files.
  const fences = (paths: string[], root?: string): string | null => {
    const freshHolds = options.holds();
    const held = [
      ...new Set(paths.flatMap((path) => holdOwners(path, freshHolds))),
    ];
    if (held.length) return `held by ${held.join(', ')}`;
    const idle = checkPathIdle(
      paths.filter((path) => path.startsWith('/')),
      liveness,
      (path) => root ?? dirname(path)
    );
    return idle.ok ? null : idle.reason;
  };
  const fenced =
    (target: string | string[], action: () => StepResult) => () => {
      const failed = fences(Array.isArray(target) ? target : [target]);
      return failed ?? action();
    };
  const removeTreeStep =
    (
      root: string,
      target: string,
      recheck?: () => string | null,
      fencePaths: string[] = [target],
      { refuseRepositories = false }: { refuseRepositories?: boolean } = {}
    ) =>
    (): StepResult => {
      // Anchor first, so a swap during the checks below is detected.
      const identity = {
        ...captureIdentity(root, target),
        refuseRepositories,
      };
      const failed = fences(fencePaths, root) ?? recheck?.() ?? null;
      if (failed) return failed;
      removeTree(identity);
      return null;
    };
  const command =
    (argv: string[], cwd?: string, env?: NodeJS.ProcessEnv) => () => {
      const result = exec(argv, cwd, env);
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
    env,
    removeTree: removeTreeStep,
    measure,
    now,
    planned: () => planned,
  };
  for (const category of requested) builders[category]?.(ctx, category);

  if (apply)
    for (const step of steps) {
      if (step.status !== 'planned' || !step.run) continue;
      try {
        const result = step.run();
        step.status = typeof result === 'string' ? 'failed' : 'done';
        if (typeof result === 'string') step.reason = result;
        else if (result) step.reason = result.note;
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
    steps: steps.map(
      ({ run: _run, fencePaths: _paths, root: _root, ...step }) => step
    ),
  };
}

export const defaultMaxRemoveBytes = 20 * GiB;
