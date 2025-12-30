#!/usr/bin/env node

/**
 * i18n Missing Keys Sync Script
 *
 * This script copies missing translation keys from the source (en.json) to the target (vi.json)
 * files. The English values are used as placeholders that should be translated later.
 *
 * Usage:
 *   node scripts/i18n-sync-missing.js
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
  'apps/tudo/messages',
  'apps/tumeet/messages',
];

/**
 * Get a nested value from an object using a dot-separated path
 */
function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Check if a key is unsafe for object assignment preventing prototype pollution
 */
function isUnsafeKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

/**
 * Set a nested value in an object using a dot-separated path
 */
function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (isUnsafeKey(key)) {
      return;
    }

    if (
      !(key in current) ||
      typeof current[key] !== 'object' ||
      current[key] === null
    ) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (isUnsafeKey(lastKey)) {
    return;
  }

  current[lastKey] = value;
}

/**
 * Get all leaf key paths from an object
 */
function getAllKeyPaths(obj, prefix = '') {
  const paths = [];

  for (const key in obj) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...getAllKeyPaths(value, fullPath));
    } else {
      paths.push(fullPath);
    }
  }

  return paths;
}

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
 * Process a translation directory
 */
function processDirectory(dir) {
  const rootDir = process.cwd();
  const fullDir = path.join(rootDir, dir);

  const enPath = path.join(fullDir, 'en.json');
  const viPath = path.join(fullDir, 'vi.json');

  if (!fs.existsSync(enPath) || !fs.existsSync(viPath)) {
    console.warn(`⚠️  Missing files in ${dir}`);
    return { added: 0, dir };
  }

  try {
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    const viContent = JSON.parse(fs.readFileSync(viPath, 'utf-8'));

    const enPaths = getAllKeyPaths(enContent);
    let addedCount = 0;

    for (const keyPath of enPaths) {
      const viValue = getNestedValue(viContent, keyPath);

      if (viValue === undefined) {
        const enValue = getNestedValue(enContent, keyPath);
        setNestedValue(viContent, keyPath, enValue);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      // Sort before saving
      const sortedContent = sortObjectKeysDeep(viContent);
      fs.writeFileSync(
        viPath,
        `${JSON.stringify(sortedContent, null, 2)}\n`,
        'utf-8'
      );
    }

    return { added: addedCount, dir };
  } catch (error) {
    console.error(`❌ Error processing ${dir}: ${error.message}`);
    return { added: 0, dir, error: error.message };
  }
}

/**
 * Main function
 */
function main() {
  console.log(
    '🔄 Syncing missing translation keys from en.json to vi.json...\n'
  );

  let totalAdded = 0;

  for (const dir of TRANSLATION_DIRS) {
    const result = processDirectory(dir);

    if (result.added > 0) {
      console.log(`   ✓ ${dir}: Added ${result.added} missing keys`);
      totalAdded += result.added;
    } else if (!result.error) {
      console.log(`   ✓ ${dir}: No missing keys`);
    }
  }

  console.log(`\n📊 Total: Added ${totalAdded} missing translation keys`);

  if (totalAdded > 0) {
    console.log('\n💡 The English values have been copied as placeholders.');
    console.log('   Please translate them to Vietnamese when possible.');
  }
}

main();
