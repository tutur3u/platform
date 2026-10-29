#!/usr/bin/env node

/**
 * Migration Timestamp Checker
 *
 * This script validates that all Supabase migration files have timestamps
 * that are not in the future. Migration files use the format:
 * YYYYMMDDHHMMSS_description.sql
 *
 * The 14-digit timestamp prefix represents when the migration was created.
 * Future-dated migrations can cause ordering issues and confusion.
 *
 * IMPORTANT: All migration timestamps are interpreted as GMT+7 (Asia/Ho_Chi_Minh)
 * to ensure consistent behavior across different CI/local environments.
 *
 * In pull request context (GITHUB_BASE_REF set), it also requires every
 * migration the PR adds or renames to sort after the newest migration already
 * on the base branch. Production `supabase db push` rejects out-of-order
 * migrations, so they must fail here first. Shallow checkouts are handled by
 * fetching the base ref and deepening until the merge-base resolves.
 * Locally, the order check uses MIGRATION_BASE_REF (default `main`) against
 * the existing `origin/<ref>` without fetching, and skips if it is missing.
 *
 * Usage:
 *   node scripts/check-migration-timestamps.js
 *
 * Exit codes:
 *   0 - All migrations have valid timestamps
 *   1 - A migration is future-dated, unparseable, or out of order
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Migration directory
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';

// GMT+7 offset in milliseconds (7 hours)
const GMT_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Parse a 14-digit timestamp string into a Date object
 * Format: YYYYMMDDHHMMSS
 *
 * The timestamp is interpreted as GMT+7 (Asia/Ho_Chi_Minh timezone)
 * to ensure consistent behavior regardless of where the script runs.
 */
function parseTimestamp(timestamp) {
  if (!/^\d{14}$/.test(timestamp)) {
    return null;
  }

  const year = parseInt(timestamp.substring(0, 4), 10);
  const month = parseInt(timestamp.substring(4, 6), 10) - 1; // JS months are 0-indexed
  const day = parseInt(timestamp.substring(6, 8), 10);
  const hour = parseInt(timestamp.substring(8, 10), 10);
  const minute = parseInt(timestamp.substring(10, 12), 10);
  const second = parseInt(timestamp.substring(12, 14), 10);

  // Create UTC timestamp, then subtract GMT+7 offset to interpret as GMT+7
  // Example: 10:00 GMT+7 = 03:00 UTC, so we do Date.UTC(10:00) - 7h = 03:00 UTC
  const utcMs = Date.UTC(year, month, day, hour, minute, second);
  return new Date(utcMs - GMT_PLUS_7_OFFSET_MS);
}

/**
 * Extract timestamp from migration filename
 * Expected format: YYYYMMDDHHMMSS_description.sql
 */
function extractTimestamp(filename) {
  const match = filename.match(/^(\d{14})_.*\.sql$/);
  return match ? match[1] : null;
}

/**
 * Format a Date object for display in both UTC and GMT+7
 */
function formatDate(date) {
  const utc = date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');

  // Calculate GMT+7 time
  const gmt7Date = new Date(date.getTime() + GMT_PLUS_7_OFFSET_MS);
  const gmt7 = gmt7Date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' GMT+7');

  return `${utc} (${gmt7})`;
}

/**
 * Find all SQL migration files
 */
function findMigrationFiles(rootDir = process.cwd()) {
  const fullDir = path.join(rootDir, MIGRATIONS_DIR);

  if (!fs.existsSync(fullDir)) {
    console.error(`Migration directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(fullDir);
  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => ({
      filename: entry,
      fullPath: path.join(fullDir, entry),
    }));
}

/**
 * Check a single migration file for future timestamp
 */
function checkMigration(file, now) {
  const timestamp = extractTimestamp(file.filename);

  if (!timestamp) {
    return {
      filename: file.filename,
      error:
        'Invalid filename format - expected YYYYMMDDHHMMSS_description.sql',
    };
  }

  const migrationDate = parseTimestamp(timestamp);

  if (!migrationDate || Number.isNaN(migrationDate.getTime())) {
    return {
      filename: file.filename,
      error: `Invalid timestamp: ${timestamp}`,
    };
  }

  if (migrationDate > now) {
    return {
      filename: file.filename,
      isFuture: true,
      timestamp,
      migrationDate,
    };
  }

  return {
    filename: file.filename,
    isFuture: false,
    timestamp,
    migrationDate,
  };
}

const MAX_DEEPEN_ATTEMPTS = 5;
const DEEPEN_STEP = 200;

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function isMigrationPath(filePath) {
  return (
    path.posix.dirname(filePath) === MIGRATIONS_DIR && filePath.endsWith('.sql')
  );
}

/**
 * Paths added or renamed-to under the migrations directory, given
 * `git diff --name-status -M` output.
 */
function parseAddedMigrations(nameStatus) {
  const added = [];
  for (const line of nameStatus.split('\n')) {
    if (!line) continue;
    const [status, ...paths] = line.split('\t');
    let target = null;
    if (status === 'A') target = paths[0];
    else if (status.startsWith('R')) target = paths[1];
    if (target && isMigrationPath(target)) added.push(target);
  }
  return added;
}

/**
 * Newest migration on the base tree, given `git ls-tree --name-only` output.
 */
function findNewestMigration(paths) {
  let newest = null;
  for (const filePath of paths) {
    if (!isMigrationPath(filePath)) continue;
    const filename = path.posix.basename(filePath);
    const timestamp = extractTimestamp(filename);
    if (timestamp && (!newest || timestamp > newest.timestamp)) {
      newest = { filename, timestamp };
    }
  }
  return newest;
}

/**
 * Added migrations whose timestamp is not strictly after the base's newest.
 */
function findOutOfOrderMigrations(addedPaths, newest) {
  if (!newest) return [];
  return addedPaths
    .map((filePath) => path.posix.basename(filePath))
    .filter((filename) => {
      const timestamp = extractTimestamp(filename);
      return timestamp !== null && timestamp <= newest.timestamp;
    })
    .sort();
}

function resolveBaseRef(env) {
  if (env.GITHUB_BASE_REF) {
    return { branch: env.GITHUB_BASE_REF, fetch: true };
  }
  if (env.CI) return null;
  return { branch: env.MIGRATION_BASE_REF || 'main', fetch: false };
}

function fetchBase(branch, remoteRef, cwd, extraArgs) {
  return git(
    [
      'fetch',
      '--no-tags',
      '--quiet',
      ...extraArgs,
      'origin',
      `+refs/heads/${branch}:${remoteRef}`,
    ],
    cwd
  );
}

/**
 * Resolve the merge-base with the base ref, fetching and deepening shallow
 * history when allowed. Returns null when the base cannot be resolved.
 */
function resolveMergeBase(base, cwd) {
  const remoteRef = `refs/remotes/origin/${base.branch}`;
  if (base.fetch) {
    const fetched = fetchBase(base.branch, remoteRef, cwd, ['--depth=1']);
    if (!fetched.ok) {
      throw new Error(
        `Could not fetch base branch "${base.branch}": ${fetched.stderr}`
      );
    }
  } else if (!git(['rev-parse', '--verify', '--quiet', remoteRef], cwd).ok) {
    return null;
  }

  for (let attempt = 0; ; attempt++) {
    const mergeBase = git(['merge-base', remoteRef, 'HEAD'], cwd);
    if (mergeBase.ok) return { mergeBase: mergeBase.stdout, remoteRef };
    const shallow =
      git(['rev-parse', '--is-shallow-repository'], cwd).stdout === 'true';
    if (!base.fetch || !shallow) {
      throw new Error(
        `No merge-base between ${remoteRef} and HEAD: ${mergeBase.stderr}`
      );
    }
    const deepen =
      attempt < MAX_DEEPEN_ATTEMPTS
        ? [`--deepen=${DEEPEN_STEP}`]
        : ['--unshallow'];
    const fetched = fetchBase(base.branch, remoteRef, cwd, deepen);
    if (!fetched.ok) {
      throw new Error(`Could not deepen history: ${fetched.stderr}`);
    }
  }
}

/**
 * Check that migrations added since the merge-base sort after the base's
 * newest migration. Returns a result describing what was compared.
 */
function checkMigrationOrder({ cwd = process.cwd(), env = process.env } = {}) {
  const base = resolveBaseRef(env);
  if (!base) return { skipped: 'no pull request base ref' };

  const resolved = resolveMergeBase(base, cwd);
  if (!resolved) return { skipped: `origin/${base.branch} not available` };

  const diff = git(
    [
      'diff',
      '--name-status',
      '-M',
      '--diff-filter=AR',
      resolved.mergeBase,
      'HEAD',
      '--',
      MIGRATIONS_DIR,
    ],
    cwd
  );
  if (!diff.ok) throw new Error(`git diff failed: ${diff.stderr}`);

  const tree = git(
    ['ls-tree', '--name-only', resolved.remoteRef, '--', `${MIGRATIONS_DIR}/`],
    cwd
  );
  if (!tree.ok) throw new Error(`git ls-tree failed: ${tree.stderr}`);

  const added = parseAddedMigrations(diff.stdout);
  const newest = findNewestMigration(tree.stdout.split('\n'));
  return {
    baseBranch: base.branch,
    added,
    newest,
    outOfOrder: findOutOfOrderMigrations(added, newest),
  };
}

function reportMigrationOrder(env = process.env) {
  let result;
  try {
    result = checkMigrationOrder({ env });
  } catch (error) {
    console.error(`Migration order check failed: ${error.message}`);
    return false;
  }

  if (result.skipped) {
    console.log(`Skipping migration order check (${result.skipped}).`);
    return true;
  }

  if (result.outOfOrder.length > 0) {
    console.error(
      `The following new migrations do not sort after the newest migration on ${result.baseBranch} (${result.newest.timestamp}, ${result.newest.filename}):\n`
    );
    for (const filename of result.outOfOrder) {
      console.error(`   ${filename}`);
    }
    console.error(
      `\nRename them to a timestamp after ${result.newest.timestamp}; production \`supabase db push\` rejects out-of-order migrations.`
    );
    return false;
  }

  console.log(
    `All ${result.added.length} new migration(s) sort after ${result.baseBranch}'s newest (${result.newest?.timestamp ?? 'none'}).`
  );
  return true;
}

/**
 * Main function
 */
function main() {
  console.log('Checking migration timestamps...');
  console.log('(All timestamps are interpreted as GMT+7)\n');

  const files = findMigrationFiles();

  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  const now = new Date();
  console.log(`Current time: ${formatDate(now)}`);
  console.log(`Found ${files.length} migration file(s)\n`);

  const results = files.map((file) => checkMigration(file, now));

  // Check for parsing errors
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    console.error('Errors parsing migration files:\n');
    for (const { filename, error } of errors) {
      console.error(`   ${filename}: ${error}`);
    }
    process.exit(1);
  }

  // Check for future-dated migrations
  const futureMigrations = results.filter((r) => r.isFuture);

  if (futureMigrations.length > 0) {
    console.error('The following migrations have future timestamps:\n');
    for (const { filename, timestamp, migrationDate } of futureMigrations) {
      console.error(`   ${filename}`);
      console.error(`      Timestamp: ${timestamp}`);
      console.error(`      Parsed as: ${formatDate(migrationDate)}`);
      console.error('');
    }
    console.error(
      'Migration timestamps should not be in the future. Please update the timestamp to the current time or earlier.'
    );
    process.exit(1);
  }

  console.log('All migration timestamps are valid (not in the future).\n');

  if (!reportMigrationOrder()) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkMigrationOrder,
  findNewestMigration,
  findOutOfOrderMigrations,
  parseAddedMigrations,
};
