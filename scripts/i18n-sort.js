#!/usr/bin/env node

/**
 * i18n Translation Sorter
 *
 * This script sorts all translation keys alphabetically at all nested levels.
 * It can either check if files are sorted (--check mode) or fix them (default mode).
 *
 * Usage:
 *   node scripts/i18n-sort.js          # Sort all translation files
 *   node scripts/i18n-sort.js --check  # Check if files are sorted (for CI)
 */

const fs = require('node:fs');
const path = require('node:path');

// Translation directories to process
const TRANSLATION_DIRS = [
  'apps/web/messages',
  'apps/calendar/messages',
  'apps/finance/messages',
  'apps/nova/messages',
  'apps/rewise/messages',
  'apps/tasks/messages',
  'apps/meet/messages',
  'apps/track/messages',
];

/**
 * Recursively sort an object's keys alphabetically
 */
function sortObjectKeysDeep(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const sortedKeys = Object.keys(obj).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortObjectKeysDeep(obj[key]);
  }

  return sortedObj;
}

/**
 * Check if two objects are deeply equal
 */
function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

/**
 * Process a single JSON file
 */
function processFile(filePath, checkOnly) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const sorted = sortObjectKeysDeep(parsed);

    if (checkOnly) {
      // Check mode: return whether file is sorted
      const isSorted = deepEqual(parsed, sorted);
      return { filePath, isSorted, error: null };
    } else {
      // Fix mode: write sorted content back
      const sortedContent = `${JSON.stringify(sorted, null, 2)}\n`;
      const wasChanged = content !== sortedContent;

      if (wasChanged) {
        fs.writeFileSync(filePath, sortedContent, 'utf-8');
      }

      return { filePath, wasChanged, error: null };
    }
  } catch (error) {
    return { filePath, error: error.message };
  }
}

/**
 * Find all JSON files in translation directories
 */
function findTranslationFiles() {
  const files = [];
  const rootDir = process.cwd();

  for (const dir of TRANSLATION_DIRS) {
    const fullDir = path.join(rootDir, dir);

    if (!fs.existsSync(fullDir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const entries = fs.readdirSync(fullDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        files.push(path.join(fullDir, entry));
      }
    }
  }

  return files;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  console.log(
    checkOnly
      ? '🔍 Checking if translation files are sorted...\n'
      : '🔧 Sorting translation files...\n'
  );

  const files = findTranslationFiles();

  if (files.length === 0) {
    console.error('❌ No translation files found!');
    process.exit(1);
  }

  const results = files.map((file) => processFile(file, checkOnly));
  const errors = results.filter((r) => r.error);
  const rootDir = process.cwd();

  if (errors.length > 0) {
    console.error('❌ Errors processing files:');
    for (const { filePath, error } of errors) {
      const relativePath = path.relative(rootDir, filePath);
      console.error(`   ${relativePath}: ${error}`);
    }
    process.exit(1);
  }

  if (checkOnly) {
    const unsorted = results.filter((r) => !r.isSorted);

    if (unsorted.length > 0) {
      console.error('❌ The following files are not sorted alphabetically:\n');
      for (const { filePath } of unsorted) {
        const relativePath = path.relative(rootDir, filePath);
        console.error(`   • ${relativePath}`);
      }
      console.error(
        '\n💡 Run `bun i18n:sort` to fix the sorting automatically.'
      );
      process.exit(1);
    }

    console.log('✅ All translation files are properly sorted!');
  } else {
    const changed = results.filter((r) => r.wasChanged);

    if (changed.length > 0) {
      console.log('📝 Sorted the following files:\n');
      for (const { filePath } of changed) {
        const relativePath = path.relative(rootDir, filePath);
        console.log(`   ✓ ${relativePath}`);
      }
    } else {
      console.log('✅ All translation files were already sorted!');
    }
  }
}

main();
