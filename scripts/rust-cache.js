#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_TARGET_PATH = path.join(ROOT_DIR, 'apps', 'backend', 'target');
const DEFAULT_STATE_FILE = path.join(
  ROOT_DIR,
  'tmp',
  'rust-cache',
  'state.json'
);
const DEFAULT_MAX_AGE_DAYS = 14;
const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024 * 1024;
const DEFAULT_AUTO_INTERVAL_HOURS = 24;
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);
const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parsePositiveNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = parsePositiveNumber(value);
  return parsed && Number.isInteger(parsed) ? parsed : null;
}

function parseBytes(value, fallback = DEFAULT_MAX_SIZE_BYTES) {
  if (value == null || String(value).trim() === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([kmgt]i?b?|b)?$/u);

  if (!match) {
    throw new Error(`Invalid byte value: ${value}`);
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid byte value: ${value}`);
  }

  const unit = match[2] ?? 'b';
  const multiplier =
    unit === 't' || unit === 'tb' || unit === 'tib'
      ? 1024 ** 4
      : unit === 'g' || unit === 'gb' || unit === 'gib'
        ? 1024 ** 3
        : unit === 'm' || unit === 'mb' || unit === 'mib'
          ? 1024 ** 2
          : unit === 'k' || unit === 'kb' || unit === 'kib'
            ? 1024
            : 1;

  return Math.floor(amount * multiplier);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

function isTruthy(value) {
  return ENABLED_VALUES.has(
    String(value ?? '')
      .trim()
      .toLowerCase()
  );
}

function isDisabled(value) {
  return DISABLED_VALUES.has(
    String(value ?? '')
      .trim()
      .toLowerCase()
  );
}

function getPathSize(absolutePath, fsImpl = fs) {
  let stat;

  try {
    stat = fsImpl.lstatSync(absolutePath);
  } catch {
    return 0;
  }

  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  let entries = [];

  try {
    entries = fsImpl.readdirSync(absolutePath);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    total += getPathSize(path.join(absolutePath, entry), fsImpl);
  }

  return total;
}

function readJsonFile(filePath, fsImpl = fs) {
  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function listTargetEntries(targetPath, fsImpl = fs) {
  if (!fsImpl.existsSync(targetPath)) return [];

  return fsImpl
    .readdirSync(targetPath, { withFileTypes: true })
    .map((entry) => {
      const absolutePath = path.join(targetPath, entry.name);
      const stat = fsImpl.lstatSync(absolutePath);

      return {
        absolutePath,
        isDirectory: entry.isDirectory(),
        mtimeMs: stat.mtimeMs,
        name: entry.name,
        sizeBytes: getPathSize(absolutePath, fsImpl),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getRustCacheReport({
  fsImpl = fs,
  targetPath = DEFAULT_TARGET_PATH,
} = {}) {
  const entries = listTargetEntries(targetPath, fsImpl);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  return {
    entries: entries.map((entry) => ({
      isDirectory: entry.isDirectory,
      mtimeMs: entry.mtimeMs,
      name: entry.name,
      path: entry.absolutePath,
      size: formatBytes(entry.sizeBytes),
      sizeBytes: entry.sizeBytes,
    })),
    targetPath,
    totalSize: formatBytes(totalBytes),
    totalSizeBytes: totalBytes,
  };
}

function selectPruneCandidates({
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  now = Date.now(),
  report,
}) {
  const cutoffMs = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const candidates = new Map();

  for (const entry of report.entries) {
    if (entry.isDirectory && entry.mtimeMs < cutoffMs) {
      candidates.set(entry.path, { ...entry, reason: 'stale' });
    }
  }

  let projectedSize = report.totalSizeBytes;
  for (const candidate of candidates.values()) {
    projectedSize -= candidate.sizeBytes;
  }

  if (projectedSize > maxSizeBytes) {
    const remainingEntries = report.entries
      .filter((entry) => entry.isDirectory && !candidates.has(entry.path))
      .sort((a, b) => a.mtimeMs - b.mtimeMs || b.sizeBytes - a.sizeBytes);

    for (const entry of remainingEntries) {
      if (projectedSize <= maxSizeBytes) break;
      candidates.set(entry.path, { ...entry, reason: 'size-cap' });
      projectedSize -= entry.sizeBytes;
    }
  }

  return [...candidates.values()].sort(
    (a, b) => a.mtimeMs - b.mtimeMs || b.sizeBytes - a.sizeBytes
  );
}

function pruneRustCache({
  apply = false,
  fsImpl = fs,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  now = Date.now(),
  targetPath = DEFAULT_TARGET_PATH,
} = {}) {
  const before = getRustCacheReport({ fsImpl, targetPath });
  const candidates = selectPruneCandidates({
    maxAgeDays,
    maxSizeBytes,
    now,
    report: before,
  });
  const removed = [];

  if (apply) {
    for (const candidate of candidates) {
      fsImpl.rmSync(candidate.path, { force: true, recursive: true });
      removed.push(candidate);
    }
  }

  const after = apply ? getRustCacheReport({ fsImpl, targetPath }) : before;

  return {
    after,
    apply,
    before,
    candidates,
    maxAgeDays,
    maxSize: formatBytes(maxSizeBytes),
    maxSizeBytes,
    removed,
  };
}

function shouldSkipAutoCleanup({
  env = process.env,
  force = false,
  now = Date.now(),
  stateFile = DEFAULT_STATE_FILE,
  autoIntervalHours = DEFAULT_AUTO_INTERVAL_HOURS,
  fsImpl = fs,
} = {}) {
  if (force) return { skip: false };
  if (isDisabled(env.TUTURUUU_RUST_CACHE_AUTO)) {
    return { reason: 'disabled', skip: true };
  }
  if (isTruthy(env.CI) && !isTruthy(env.TUTURUUU_RUST_CACHE_AUTO_IN_CI)) {
    return { reason: 'ci', skip: true };
  }
  if (isTruthy(env.TUTURUUU_RUST_CACHE_DISABLED)) {
    return { reason: 'disabled', skip: true };
  }

  const state = readJsonFile(stateFile, fsImpl);
  const lastRunAt = Date.parse(state?.lastRunAt ?? '');
  const intervalMs = autoIntervalHours * 60 * 60 * 1000;

  if (Number.isFinite(lastRunAt) && now - lastRunAt < intervalMs) {
    return { reason: 'recent', skip: true };
  }

  return { skip: false };
}

function runAutoRustCacheCleanup({
  env = process.env,
  fsImpl = fs,
  force = false,
  maxAgeDays = parsePositiveInteger(env.TUTURUUU_RUST_CACHE_MAX_AGE_DAYS) ??
    DEFAULT_MAX_AGE_DAYS,
  maxSizeBytes = parseBytes(env.TUTURUUU_RUST_CACHE_MAX_SIZE),
  now = Date.now(),
  stateFile = env.TUTURUUU_RUST_CACHE_STATE_FILE || DEFAULT_STATE_FILE,
  targetPath = env.TUTURUUU_RUST_CACHE_TARGET || DEFAULT_TARGET_PATH,
  autoIntervalHours = parsePositiveNumber(
    env.TUTURUUU_RUST_CACHE_AUTO_INTERVAL_HOURS
  ) ?? DEFAULT_AUTO_INTERVAL_HOURS,
} = {}) {
  const skip = shouldSkipAutoCleanup({
    autoIntervalHours,
    env,
    force,
    fsImpl,
    now,
    stateFile,
  });

  if (skip.skip) {
    return {
      reason: skip.reason,
      skipped: true,
      stateFile,
      targetPath,
    };
  }

  const result = pruneRustCache({
    apply: true,
    fsImpl,
    maxAgeDays,
    maxSizeBytes,
    now,
    targetPath,
  });

  writeJsonFile(
    stateFile,
    {
      lastRunAt: new Date(now).toISOString(),
      removedBytes: result.removed.reduce(
        (sum, entry) => sum + entry.sizeBytes,
        0
      ),
      removedEntries: result.removed.map((entry) => ({
        name: entry.name,
        reason: entry.reason,
        sizeBytes: entry.sizeBytes,
      })),
      targetPath,
    },
    fsImpl
  );

  return {
    ...result,
    skipped: false,
    stateFile,
  };
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = [...argv];
  const command = args.shift() || 'report';
  const options = {
    apply: false,
    command,
    env,
    force: false,
    maxAgeDays:
      parsePositiveInteger(env.TUTURUUU_RUST_CACHE_MAX_AGE_DAYS) ??
      DEFAULT_MAX_AGE_DAYS,
    maxSizeBytes: parseBytes(env.TUTURUUU_RUST_CACHE_MAX_SIZE),
    stateFile: env.TUTURUUU_RUST_CACHE_STATE_FILE || DEFAULT_STATE_FILE,
    targetPath: env.TUTURUUU_RUST_CACHE_TARGET || DEFAULT_TARGET_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--apply') options.apply = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--max-age-days') {
      options.maxAgeDays = parsePositiveInteger(args[++index]);
    } else if (arg === '--max-size') {
      options.maxSizeBytes = parseBytes(args[++index]);
    } else if (arg === '--state-file') {
      options.stateFile = path.resolve(args[++index]);
    } else if (arg === '--target') {
      options.targetPath = path.resolve(args[++index]);
    } else {
      throw new Error(`Unknown rust-cache option: ${arg}`);
    }
  }

  if (!options.maxAgeDays) {
    throw new Error('--max-age-days must be a positive integer.');
  }

  return options;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);
  let result;

  if (options.command === 'report') {
    result = getRustCacheReport({ targetPath: options.targetPath });
  } else if (options.command === 'prune') {
    result = pruneRustCache(options);
  } else if (options.command === 'auto') {
    result = runAutoRustCacheCleanup({
      ...options,
      force: options.force,
    });
  } else {
    throw new Error(`Unknown rust-cache command: ${options.command}`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  DEFAULT_AUTO_INTERVAL_HOURS,
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_STATE_FILE,
  DEFAULT_TARGET_PATH,
  formatBytes,
  getPathSize,
  getRustCacheReport,
  parseArgs,
  parseBytes,
  pruneRustCache,
  runAutoRustCacheCleanup,
  selectPruneCandidates,
  shouldSkipAutoCleanup,
};
