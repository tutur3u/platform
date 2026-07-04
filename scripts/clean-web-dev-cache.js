#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { formatBytes } = require('./diagnose-web-dev-speed');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_NEXT_DEV_TARGETS = ['apps/web/.next/dev'];
const TURBO_CACHE_TARGET = '.turbo/cache';

function printHelp(output = process.stdout) {
  output.write(`Clean local web development caches.

Usage:
  bun clean:dev:web [--dry-run] [--all-next-dev] [--include-turbo-cache]

Options:
  --dry-run              Print targets and sizes without deleting anything.
  --all-next-dev         Include every existing apps/*/.next/dev cache.
  --include-turbo-cache  Also remove .turbo/cache.
  --help                 Show this help.
`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    allNextDev: false,
    dryRun: false,
    help: false,
    includeTurboCache: false,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--all-next-dev') {
      options.allNextDev = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--include-turbo-cache') {
      options.includeTurboCache = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function isSafeTarget(relativePath) {
  return (
    /^apps\/[^/]+\/\.next\/dev$/u.test(relativePath) ||
    relativePath === TURBO_CACHE_TARGET
  );
}

function assertSafeTarget(relativePath) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes('..') ||
    !isSafeTarget(relativePath)
  ) {
    throw new Error(`Refusing to clean unsafe target: ${relativePath}`);
  }
}

function listNextDevTargets({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const appsDir = path.join(rootDir, 'apps');

  if (!fsImpl.existsSync(appsDir)) {
    return [];
  }

  return fsImpl
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `apps/${entry.name}/.next/dev`)
    .filter((relativePath) =>
      fsImpl.existsSync(path.join(rootDir, relativePath))
    )
    .sort();
}

function resolveTargets(
  { allNextDev = false, includeTurboCache = false } = {},
  { fsImpl = fs, rootDir = ROOT_DIR } = {}
) {
  const targets = allNextDev
    ? listNextDevTargets({ fsImpl, rootDir })
    : [...DEFAULT_NEXT_DEV_TARGETS];

  if (includeTurboCache) {
    targets.push(TURBO_CACHE_TARGET);
  }

  return [...new Set(targets)].sort();
}

function getDiskUsageBytes(
  targetPath,
  { execFileSyncImpl = execFileSync, fsImpl = fs } = {}
) {
  if (!fsImpl.existsSync(targetPath)) {
    return { bytes: 0, exists: false };
  }

  try {
    const output = execFileSyncImpl('du', ['-sk', targetPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const kilobytes = Number.parseInt(output.trim().split(/\s+/u)[0], 10);

    if (Number.isFinite(kilobytes)) {
      return { bytes: kilobytes * 1024, exists: true };
    }
  } catch {
    // Fall back to stat size in tests or minimal shells.
  }

  return { bytes: fsImpl.statSync(targetPath).size, exists: true };
}

function cleanWebDevCache(
  options = {},
  {
    execFileSyncImpl = execFileSync,
    fsImpl = fs,
    output = process.stdout,
    rootDir = ROOT_DIR,
  } = {}
) {
  const targets = resolveTargets(options, { fsImpl, rootDir });
  const summaries = [];

  for (const relativePath of targets) {
    assertSafeTarget(relativePath);

    const absolutePath = path.join(rootDir, relativePath);
    const usage = getDiskUsageBytes(absolutePath, { execFileSyncImpl, fsImpl });

    summaries.push({
      ...usage,
      path: relativePath,
    });

    if (!usage.exists) {
      output.write(`missing ${relativePath}\n`);
      continue;
    }

    if (options.dryRun) {
      output.write(
        `would remove ${relativePath} (${formatBytes(usage.bytes)})\n`
      );
      continue;
    }

    fsImpl.rmSync(absolutePath, { force: true, recursive: true });
    output.write(`removed ${relativePath} (${formatBytes(usage.bytes)})\n`);
  }

  const totalBytes = summaries.reduce(
    (sum, summary) => sum + (summary.exists ? summary.bytes : 0),
    0
  );
  const verb = options.dryRun ? 'Would reclaim' : 'Reclaimed';

  output.write(`${verb} ${formatBytes(totalBytes)} from dev cache targets.\n`);

  return { summaries, totalBytes };
}

function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      printHelp();
      return;
    }

    cleanWebDevCache(options);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  assertSafeTarget,
  cleanWebDevCache,
  DEFAULT_NEXT_DEV_TARGETS,
  getDiskUsageBytes,
  listNextDevTargets,
  parseArgs,
  resolveTargets,
  TURBO_CACHE_TARGET,
};
