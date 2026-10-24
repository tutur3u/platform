import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import {
  formatBytes,
  probeVolume,
  type StoragePressure,
  type StorageThresholds,
  storagePressure,
  type VolumeProbe,
} from './storage-headroom';
import {
  type CwdLister,
  type Hold,
  holdOwners,
  isInside,
} from './storage-holds';
import {
  type MeasureJob,
  type MeasureMethod,
  type Measurer,
  measureTrees,
} from './storage-measure';
import { resolveNpmCacheRoot } from './storage-scratch';
import {
  type DockerUsage,
  type DockerVolume,
  dockerUsage,
  machineTargets,
  oldTmpDirs,
  type StorageCategory,
  type StorageRisk,
  supabaseVolumes,
  unavailableSimulators,
} from './storage-targets';
import {
  classifyWorktrees,
  discoverRepos,
  type Git,
  type NodeModulesStaleness,
  nodeModulesStaleness,
  type PullRequestLookup,
  realGit,
  type WorktreeReport,
} from './storage-worktrees';

// In-checkout rebuildable outputs. Mirrors ARTIFACT_RULES in
// scripts/worktree-footprint-git.js (#6436), which owns their pruning.
const ARTIFACT_PATTERNS = [
  '.turbo',
  'apps/*/.turbo',
  'packages/*/.turbo',
  'apps/*/.next',
  'apps/*/.open-next',
  'apps/*/dist',
  'packages/*/dist',
  'apps/*/build',
  'packages/*/build',
  'apps/*/.dart_tool',
];
const RUST_TARGET = join('apps', 'backend', 'target');

export interface StorageItem {
  category: StorageCategory;
  label: string;
  path: string;
  uniqueBytes: number;
  allocatedBytes: number;
  files: number;
  truncated: boolean;
  risk: StorageRisk;
  worktree?: string;
  /** Hold-file owners covering this path; `suggest` never proposes it. */
  heldBy?: string[];
}

export interface VolumeReport extends VolumeProbe {
  pressure: StoragePressure;
  reasons: string[];
}

export interface StorageReport {
  version: 1;
  generatedAt: string;
  platform: NodeJS.Platform;
  method: MeasureMethod;
  thresholds: StorageThresholds;
  volumes: VolumeReport[];
  items: StorageItem[];
  worktrees: (WorktreeReport & { uniqueBytes: number })[];
  nodeModules: NodeModulesStaleness[];
  docker: { usage: DockerUsage[]; supabaseVolumes: DockerVolume[] } | null;
  tmpOlderThanDays: number;
  warnings: string[];
}

/** Distinct volumes behind the given paths (deduplicated by device). */
export async function storageVolumes(
  paths: string[],
  thresholds: StorageThresholds,
  probe = probeVolume
): Promise<VolumeReport[]> {
  const seen = new Set<number | string>();
  const volumes: VolumeReport[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const volume = await probe(path);
    const key = volume.device ?? volume.path;
    if (seen.has(key)) continue;
    seen.add(key);
    volumes.push({ ...volume, ...storagePressure(volume, thresholds) });
  }
  return volumes;
}

export function defaultVolumePaths(extra: string[] = []) {
  return [
    homedir(),
    process.cwd(),
    ...(process.platform === 'linux' ? ['/var/lib/docker', '/tmp'] : []),
    ...extra,
  ];
}

function expand(root: string, pattern: string) {
  let matches = [root];
  for (const segment of pattern.split('/')) {
    const next: string[] = [];
    for (const base of matches) {
      if (segment !== '*') {
        const target = join(base, segment);
        if (lstatSync(target, { throwIfNoEntry: false })?.isDirectory())
          next.push(target);
        continue;
      }
      try {
        for (const entry of readdirSync(base, { withFileTypes: true }))
          if (entry.isDirectory()) next.push(join(base, entry.name));
      } catch {
        // Missing parents produce no matches.
      }
    }
    matches = next;
  }
  return matches;
}

/** Ignored, untracked artifact directories in one checkout. */
export function findArtifacts(checkout: string, git: Git = realGit) {
  const found = [...ARTIFACT_PATTERNS, RUST_TARGET].flatMap((pattern) =>
    expand(checkout, pattern)
  );
  if (!found.length) return [];
  const rel = found.map((path) => relative(checkout, path));
  let ignored: Set<string>;
  try {
    ignored = new Set(
      git(checkout, ['check-ignore', '--', ...rel])
        .split('\n')
        .filter(Boolean)
    );
  } catch {
    return [];
  }
  const tracked = git(checkout, ['ls-files', '-z', '--', ...rel])
    .split('\0')
    .filter(Boolean);
  return found.filter((_path, index) => {
    const dir = rel[index]!;
    return (
      ignored.has(dir) &&
      !tracked.some((file) => file === dir || file.startsWith(`${dir}/`))
    );
  });
}

export async function analyzeStorage({
  roots = [],
  holds,
  thresholds,
  tmpOlderThanDays = 3,
  offline = false,
  maxEntries = 2_000_000,
  git = realGit,
  cwds,
  prs,
  measure = measureTrees,
  docker = true,
  now = Date.now(),
}: {
  roots?: string[];
  holds: Hold[];
  thresholds: StorageThresholds;
  tmpOlderThanDays?: number;
  offline?: boolean;
  maxEntries?: number;
  git?: Git;
  cwds: ReturnType<CwdLister>;
  prs: PullRequestLookup;
  measure?: Measurer;
  docker?: boolean;
  now?: number;
}): Promise<StorageReport> {
  const warnings: string[] = [];
  const jobs: (MeasureJob & {
    item: Omit<
      StorageItem,
      'uniqueBytes' | 'allocatedBytes' | 'files' | 'truncated'
    >;
  })[] = [];
  const add = (item: (typeof jobs)[number]['item'], exclude: string[] = []) =>
    jobs.push({ root: item.path, exclude, maxEntries, item });

  const worktrees: WorktreeReport[] = [];
  const nodeModules: NodeModulesStaleness[] = [];
  const repos = discoverRepos({ roots, git });
  if (!repos.length)
    warnings.push(
      'No Git repository found; pass --repo <path> to include worktrees.'
    );
  for (const repo of repos) {
    const list = classifyWorktrees({
      repo,
      holds,
      cwds,
      git,
      prs: offline ? null : prs(repo),
      now,
    });
    if (!offline && list.length && !list.some((entry) => entry.pullRequest))
      warnings.push(
        `No pull request data for ${repo}; merged state uses ancestry only (is gh authenticated?).`
      );
    worktrees.push(...list);
  }
  const roots_ = worktrees
    .filter((entry) => entry.classification !== 'orphaned')
    .map((entry) => entry.path);
  for (const worktree of worktrees) {
    if (worktree.classification === 'orphaned') continue;
    const artifacts = findArtifacts(worktree.path, git);
    const staleness = nodeModulesStaleness(worktree.path);
    if (staleness) nodeModules.push(staleness);
    const nested = roots_.filter(
      (root) => root !== worktree.path && isInside(root, worktree.path)
    );
    const modules = join(worktree.path, 'node_modules');
    add(
      {
        category: 'worktrees',
        label: `${worktree.classification} ${worktree.branch ?? 'detached'}`,
        path: worktree.path,
        risk: worktree.fences.length ? 'high' : 'safe',
        worktree: worktree.path,
      },
      [join(worktree.path, '.git'), modules, ...nested, ...artifacts]
    );
    for (const artifact of artifacts)
      add({
        category: artifact.endsWith(RUST_TARGET)
          ? 'rust-target'
          : 'build-artifacts',
        label: relative(worktree.path, artifact),
        path: artifact,
        risk: worktree.fences.length ? 'moderate' : 'safe',
        worktree: worktree.path,
      });
    // Fresh node_modules are APFS clones (0 unique); only stale stores are walked.
    if (staleness?.stale)
      add({
        category: 'node-modules-stale',
        label: `${staleness.bunEntries} store entries vs ${staleness.lockPackages} in bun.lock`,
        path: modules,
        risk: 'moderate',
        worktree: worktree.path,
      });
  }

  // Unavailable simulators are measured on their own so `suggest` reports
  // what `xcrun simctl delete unavailable` actually frees.
  const unavailable = unavailableSimulators();
  for (const path of unavailable)
    add({
      category: 'xcode-simulators',
      label: 'unavailable simulator',
      path,
      risk: 'safe',
    });
  for (const target of machineTargets({ npmCacheRoot: resolveNpmCacheRoot() }))
    for (const path of target.paths)
      add(
        {
          category: target.category,
          label: target.label,
          path,
          risk:
            target.category === 'xcode-simulators' ? 'moderate' : target.risk,
        },
        unavailable.filter((device) => isInside(device, path))
      );
  for (const dir of oldTmpDirs({
    olderThanMs: tmpOlderThanDays * 86_400_000,
    now,
  }))
    add({
      category: 'tmp-old',
      label: `idle ${Math.floor((now - dir.newestMtimeMs) / 86_400_000)}d`,
      path: dir.path,
      risk: 'moderate',
    });

  const measured = measure(
    jobs.map(({ root, exclude, maxEntries: cap }) => ({
      root,
      exclude,
      maxEntries: cap,
    }))
  );
  const measuredItems: StorageItem[] = jobs.map((job, index) => {
    const result = measured.results[index] ?? {
      files: 0,
      apparentBytes: 0,
      allocatedBytes: 0,
      uniqueBytes: 0,
      truncated: true,
    };
    return {
      ...job.item,
      uniqueBytes: result.uniqueBytes,
      allocatedBytes: result.allocatedBytes,
      files: result.files,
      truncated: result.truncated,
    };
  });
  const items = foldSmallTmp(measuredItems).map((item) => {
    if (item.category === 'worktrees' || !item.path.startsWith('/'))
      return item;
    const heldBy = holdOwners(item.path, holds);
    return heldBy.length ? { ...item, heldBy } : item;
  });
  if (items.some((item) => item.truncated))
    warnings.push(
      `Some trees exceeded ${maxEntries} entries and are under-reported (raise --max-entries).`
    );

  let dockerReport: StorageReport['docker'] = null;
  if (docker) {
    const usage = dockerUsage();
    if (usage) {
      dockerReport = { usage, supabaseVolumes: supabaseVolumes() };
      for (const row of usage)
        items.push({
          category: 'docker',
          label: `docker ${row.type}: ${row.active}/${row.totalCount} active, ${formatBytes(row.reclaimableBytes)} reclaimable`,
          path: `docker:${row.type}`,
          uniqueBytes: row.reclaimableBytes,
          allocatedBytes: row.sizeBytes,
          files: row.totalCount,
          truncated: false,
          risk: /volume/iu.test(row.type)
            ? 'high'
            : /build/iu.test(row.type)
              ? 'safe'
              : 'moderate',
        });
      for (const volume of dockerReport.supabaseVolumes)
        items.push({
          category: 'supabase-volumes',
          label: `Supabase ${volume.project} volume (${volume.links ? 'in use' : 'unused'})`,
          path: `docker-volume:${volume.name}`,
          uniqueBytes: volume.sizeBytes,
          allocatedBytes: volume.sizeBytes,
          files: 0,
          truncated: false,
          risk: 'high',
        });
    }
  }

  const totals = new Map<string, number>();
  for (const item of items)
    if (item.worktree)
      totals.set(
        item.worktree,
        (totals.get(item.worktree) ?? 0) + item.uniqueBytes
      );

  return {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    platform: process.platform,
    method: measured.method,
    thresholds,
    volumes: await storageVolumes(defaultVolumePaths(repos), thresholds),
    items: items.sort((a, b) => b.uniqueBytes - a.uniqueBytes),
    worktrees: worktrees.map((entry) => ({
      ...entry,
      uniqueBytes: totals.get(entry.path) ?? 0,
    })),
    nodeModules,
    docker: dockerReport,
    tmpOlderThanDays,
    warnings,
  };
}

/**
 * Thousands of tiny idle tmp dirs (sockets, lock dirs, test fixtures) bury the
 * real consumers; fold those under 1 MiB into one informational row.
 */
export function foldSmallTmp(items: StorageItem[], minBytes = 1024 ** 2) {
  const small = items.filter(
    (item) => item.category === 'tmp-old' && item.uniqueBytes < minBytes
  );
  if (small.length < 2) return items;
  const kept = items.filter((item) => !small.includes(item));
  kept.push({
    category: 'tmp-old',
    label: `${small.length} idle tmp dirs under ${formatBytes(minBytes)} each (not pruned)`,
    path: '(tmp-small)',
    uniqueBytes: small.reduce((sum, item) => sum + item.uniqueBytes, 0),
    allocatedBytes: small.reduce((sum, item) => sum + item.allocatedBytes, 0),
    files: small.reduce((sum, item) => sum + item.files, 0),
    truncated: small.some((item) => item.truncated),
    risk: 'moderate',
  });
  return kept;
}
