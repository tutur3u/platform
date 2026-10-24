#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { formatBytes, parseBytes } = require('./rust-cache.js');
const {
  artifactCheckoutSafety,
  artifactLiveness,
  walkArtifact,
} = require('./worktree-footprint-safety.js');
const {
  ARTIFACT_RULES,
  findArtifactDirs,
  git,
  inspectWorktree,
  isInside,
  listWorktrees,
  newestMtimeMs,
  readHolds,
} = require('./worktree-footprint-git.js');
const {
  canMeasureApfsPrivate,
  measureTreeAllocated,
  measureTrees,
} = require('./worktree-footprint-size.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BASE_REF = 'origin/main';
const DEFAULT_MIN_IDLE_HOURS = 24;
const DEFAULT_MAX_REMOVE_BYTES = 20 * 1024 ** 3;
const DEFAULT_HOLDS_FILE = path.join(
  os.homedir(),
  '.t3',
  'cleanup',
  'holds.d',
  'tuturuuu.txt'
);

function getFootprintReport({
  apfsPrivate = canMeasureApfsPrivate(),
  execFile = execFileSync,
  only = null,
  repoDir = ROOT_DIR,
} = {}) {
  const all = listWorktrees(repoDir, execFile).filter(
    (worktree) =>
      !worktree.bare && !worktree.prunable && fs.existsSync(worktree.path)
  );
  // Nested registered worktrees are excluded from their parent's walk even
  // when --worktree narrows the report.
  const roots = all.map((worktree) => worktree.path);
  const worktrees = only
    ? all.filter((worktree) =>
        only.some((filter) => path.resolve(filter) === worktree.path)
      )
    : all;
  const jobs = worktrees.map((worktree) => {
    const artifacts = findArtifactDirs(worktree.path, { execFile });
    const nodeModules = path.join(worktree.path, 'node_modules');
    return {
      artifacts,
      dirs: [nodeModules, ...artifacts.map((artifact) => artifact.path)],
      exclude: [
        path.join(worktree.path, '.git'),
        ...roots.filter(
          (root) => root !== worktree.path && isInside(root, worktree.path)
        ),
      ],
      nodeModules,
      root: worktree.path,
    };
  });
  const measured = measureTrees(
    jobs.map(({ dirs, exclude, root }) => ({ dirs, exclude, root })),
    { apfsPrivate }
  );

  return {
    apfsPrivate,
    worktrees: worktrees.map((worktree, index) => {
      const buckets = measured[index];
      const job = jobs[index];
      const sum = (key) =>
        Object.values(buckets).reduce(
          (total, bucket) =>
            bucket[key] == null ? total : total + bucket[key],
          apfsPrivate || key !== 'privateBytes' ? 0 : null
        );
      return {
        artifacts: job.artifacts.map((artifact) => ({
          ...artifact,
          ...buckets[artifact.path],
        })),
        branch: worktree.branch ?? null,
        head: worktree.head,
        nodeModules: buckets[job.nodeModules],
        path: worktree.path,
        primary: worktree.primary,
        source: buckets[worktree.path],
        total: {
          allocatedBytes: sum('allocatedBytes'),
          apparentBytes: sum('apparentBytes'),
          files: sum('files'),
          privateBytes: sum('privateBytes'),
        },
      };
    }),
  };
}

function summarizeArtifacts(artifacts) {
  const byCategory = new Map();
  for (const artifact of artifacts) {
    const entry = byCategory.get(artifact.category) ?? { bytes: 0, dirs: 0 };
    entry.bytes += artifact.privateBytes ?? artifact.allocatedBytes ?? 0;
    entry.dirs += 1;
    byCategory.set(artifact.category, entry);
  }
  return [...byCategory]
    .map(
      ([category, { bytes, dirs }]) =>
        `${category}=${formatBytes(bytes)}(${dirs})`
    )
    .join(' ');
}

function formatReport(report) {
  const unique = report.apfsPrivate ? 'unique(APFS)' : 'unique(n/a)';
  const lines = [
    `${'worktree'.padEnd(64)} ${'allocated'.padStart(10)} ${unique.padStart(13)} ${'node_mod'.padStart(10)} artifacts`,
  ];
  for (const worktree of report.worktrees) {
    const artifacts = summarizeArtifacts(worktree.artifacts);
    lines.push(
      `${worktree.path.padEnd(64)} ${formatBytes(worktree.total.allocatedBytes).padStart(10)} ${(worktree.total.privateBytes == null ? '-' : formatBytes(worktree.total.privateBytes)).padStart(13)} ${formatBytes(worktree.nodeModules.allocatedBytes).padStart(10)} ${artifacts}`
    );
  }
  return `${lines.join('\n')}\n`;
}

function planPrune(options = {}) {
  const {
    baseRef = DEFAULT_BASE_REF,
    categories = null,
    currentDir = process.cwd(),
    execFile = execFileSync,
    holds = [],
    maxRemoveBytes = DEFAULT_MAX_REMOVE_BYTES,
    minIdleHours = DEFAULT_MIN_IDLE_HOURS,
    now = Date.now(),
    only = null,
    repoDir = ROOT_DIR,
  } = options;
  const idleCutoffMs = now - minIdleHours * 60 * 60 * 1000;
  const candidates = [];
  const eligible = [];
  const skipped = [];
  let plannedBytes = 0;

  for (const worktree of listWorktrees(repoDir, execFile)) {
    if (only && !only.some((filter) => path.resolve(filter) === worktree.path))
      continue;
    const skip = (reason) => skipped.push({ path: worktree.path, reason });

    if (worktree.primary) {
      skip('primary-checkout');
      continue;
    }
    if (worktree.bare) {
      skip('bare');
      continue;
    }
    if (worktree.locked) {
      skip('locked');
      continue;
    }
    if (isInside(currentDir, worktree.path)) {
      skip('current-worktree');
      continue;
    }

    const info = inspectWorktree(worktree, { baseRef, execFile, holds });
    if (info.missing) {
      skip('missing');
      continue;
    }
    if (info.held) {
      skip('held');
      continue;
    }
    if (info.dirtyPaths > 0) {
      skip('dirty');
      continue;
    }
    if (!info.merged) {
      skip(`not-merged-into-${baseRef}`);
      continue;
    }
    if (info.activityMtimeMs > idleCutoffMs) {
      skip('recently-active');
      continue;
    }
    eligible.push(worktree.path);

    for (const artifact of findArtifactDirs(worktree.path, {
      execFile,
      skipped,
    })) {
      if (categories && !categories.includes(artifact.category)) continue;
      const safety = artifactCheckoutSafety(artifact.path, worktree.path);
      if (safety) {
        skipped.push({ path: artifact.path, reason: safety });
        continue;
      }
      if (newestMtimeMs(artifact.path) > idleCutoffMs) {
        skipped.push({ path: artifact.path, reason: 'recently-written' });
        continue;
      }
      const { allocatedBytes } = measureTreeAllocated({ root: artifact.path })[
        artifact.path
      ];
      if (plannedBytes + allocatedBytes > maxRemoveBytes) {
        skipped.push({ path: artifact.path, reason: 'max-remove-reached' });
        continue;
      }
      plannedBytes += allocatedBytes;
      candidates.push({
        ...artifact,
        allocatedBytes,
        head: info.head,
        size: formatBytes(allocatedBytes),
        worktree: worktree.path,
      });
    }
  }

  return {
    baseRef,
    candidates,
    eligible,
    maxRemoveBytes,
    minIdleHours,
    plannedBytes,
    skipped,
  };
}

function pruneArtifacts({
  apply = false,
  execFile = execFileSync,
  spawnFile = spawnSync,
  ...options
} = {}) {
  const plan = planPrune({ execFile, ...options });
  const removed = [];

  if (apply) {
    for (const candidate of plan.candidates) {
      // Re-check right before deleting: the worktree must still be clean, on
      // the same HEAD, and the target a real directory inside it.
      const head = git(
        candidate.worktree,
        ['rev-parse', 'HEAD'],
        execFile
      ).trim();
      const status = git(
        candidate.worktree,
        ['status', '--porcelain=v1'],
        execFile
      );
      const stat = fs.lstatSync(candidate.path, { throwIfNoEntry: false });
      if (
        head !== candidate.head ||
        status.trim() !== '' ||
        !stat?.isDirectory()
      )
        continue;
      if (
        !isInside(
          fs.realpathSync(candidate.path),
          fs.realpathSync(candidate.worktree)
        )
      )
        continue;
      const safety =
        artifactCheckoutSafety(candidate.path, candidate.worktree) ||
        artifactLiveness(candidate.path, spawnFile);
      if (safety) {
        plan.skipped.push({ path: candidate.path, reason: safety });
        continue;
      }
      const removal = walkArtifact(candidate.path, { remove: true });
      if (removal) {
        plan.skipped.push({ path: candidate.path, reason: removal });
        continue;
      }
      removed.push(candidate);
    }
  }

  return {
    ...plan,
    apply,
    plannedSize: formatBytes(plan.plannedBytes),
    removed,
    removedSize: formatBytes(
      removed.reduce((sum, entry) => sum + entry.allocatedBytes, 0)
    ),
  };
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = [...argv];
  const options = {
    apply: false,
    baseRef: DEFAULT_BASE_REF,
    categories: null,
    command: args.shift() || 'report',
    holdsFile: env.TUTURUUU_WORKTREE_HOLDS_FILE ?? DEFAULT_HOLDS_FILE,
    optionalHoldsFile: env.TUTURUUU_WORKTREE_HOLDS_FILE === undefined,
    json: false,
    maxRemoveBytes: DEFAULT_MAX_REMOVE_BYTES,
    minIdleHours: DEFAULT_MIN_IDLE_HOURS,
    only: null,
  };
  const known = new Set(ARTIFACT_RULES.map((rule) => rule.category));

  const valueFlags = new Set([
    '--base',
    '--worktree',
    '--holds-file',
    '--max-remove',
    '--min-idle-hours',
    '--category',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    let value;
    if (valueFlags.has(arg)) {
      value = args[++index];
      if (!value || value.startsWith('--'))
        throw new Error(`${arg} requires a value.`);
    }
    if (arg === '--apply') options.apply = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--base') options.baseRef = value;
    else if (arg === '--holds-file') {
      options.holdsFile = value;
      options.optionalHoldsFile = false;
    } else if (arg === '--max-remove')
      options.maxRemoveBytes = parseBytes(value);
    else if (arg === '--min-idle-hours') {
      options.minIdleHours = Number(value);
      if (!Number.isFinite(options.minIdleHours) || options.minIdleHours < 0) {
        throw new Error('--min-idle-hours must be a non-negative number.');
      }
    } else if (arg === '--worktree') {
      options.only = [...(options.only ?? []), value];
    } else if (arg === '--category') {
      const category = value;
      if (!known.has(category)) {
        throw new Error(
          `Unknown category ${category}; expected one of ${[...known].join(', ')}`
        );
      }
      options.categories = [...(options.categories ?? []), category];
    } else {
      throw new Error(`Unknown worktree-footprint option: ${arg}`);
    }
  }

  if (!options.holdsFile) throw new Error('Holds file path must not be empty.');
  if (!['report', 'prune'].includes(options.command)) {
    throw new Error(`Unknown worktree-footprint command: ${options.command}`);
  }
  if (options.command === 'report' && options.apply) {
    throw new Error('--apply is only valid with the prune command.');
  }

  return options;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);

  if (options.command === 'report') {
    const report = getFootprintReport({ only: options.only });
    process.stdout.write(
      options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatReport(report)
    );
    return 0;
  }

  const result = pruneArtifacts({
    ...options,
    holds: readHolds(options.holdsFile, fs, {
      optional: options.optionalHoldsFile,
    }),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!options.apply && result.candidates.length > 0) {
    process.stderr.write(
      'Dry run only. Re-run with --apply to build and apply a fresh plan.\n'
    );
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_BASE_REF,
  DEFAULT_MAX_REMOVE_BYTES,
  DEFAULT_MIN_IDLE_HOURS,
  formatReport,
  getFootprintReport,
  parseArgs,
  planPrune,
  pruneArtifacts,
};
