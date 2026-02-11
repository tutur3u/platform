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
 * Usage:
 *   node scripts/check-migration-timestamps.js
 *
 * Exit codes:
 *   0 - All migrations have valid (past/present) timestamps
 *   1 - One or more migrations have future timestamps
 */

const fs = require('node:fs');
const path = require('node:path');

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
function findMigrationFiles() {
  const rootDir = process.cwd();
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

  console.log('All migration timestamps are valid (not in the future).');
}

main();
