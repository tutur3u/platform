#!/usr/bin/env node

/**
 * i18n Key Parity Checker
 *
 * This script ensures bidirectional key parity between en.json and vi.json.
 * It checks that all keys in en.json exist in vi.json AND vice versa.
 *
 * Usage:
 *   node scripts/i18n-key-parity.js
 */

const fs = require('node:fs');
const path = require('node:path');

// Translation directories to process
const TRANSLATION_DIRS = [
  'apps/web/messages',
  'apps/calendar/messages',
  'apps/cms/messages',
  'apps/finance/messages',
  'apps/nova/messages',
  'apps/rewise/messages',
  'apps/tasks/messages',
  'apps/meet/messages',
  'apps/track/messages',
];

/**
 * Recursively extract all key paths from an object
 * @param {object} obj - The object to extract keys from
 * @param {string} prefix - Current key path prefix
 * @returns {string[]} - Array of dot-separated key paths
 */
function extractKeyPaths(obj, prefix = '') {
  const keys = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (
      obj[key] !== null &&
      typeof obj[key] === 'object' &&
      !Array.isArray(obj[key])
    ) {
      keys.push(...extractKeyPaths(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

function extractInvalidLeafPaths(obj, prefix = '') {
  const keys = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractInvalidLeafPaths(value, fullKey));
      continue;
    }

    if (value === null) {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Check key parity between two JSON files
 * @param {string} dir - Directory containing the translation files
 * @returns {object} - Result with missing keys for each file
 */
function checkKeyParity(dir) {
  const enPath = path.join(dir, 'en.json');
  const viPath = path.join(dir, 'vi.json');

  // Check if both files exist
  if (!fs.existsSync(enPath)) {
    return { error: `en.json not found in ${dir}` };
  }
  if (!fs.existsSync(viPath)) {
    return { error: `vi.json not found in ${dir}` };
  }

  try {
    const enContent = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    const viContent = JSON.parse(fs.readFileSync(viPath, 'utf-8'));

    const enKeys = new Set(extractKeyPaths(enContent));
    const viKeys = new Set(extractKeyPaths(viContent));
    const invalidInEn = extractInvalidLeafPaths(enContent);
    const invalidInVi = extractInvalidLeafPaths(viContent);

    // Keys in en.json but not in vi.json
    const missingInVi = [...enKeys].filter((key) => !viKeys.has(key)).sort();

    // Keys in vi.json but not in en.json
    const missingInEn = [...viKeys].filter((key) => !enKeys.has(key)).sort();

    return {
      dir,
      invalidInEn,
      invalidInVi,
      missingInVi,
      missingInEn,
      error: null,
    };
  } catch (error) {
    return { dir, error: error.message };
  }
}

/**
 * Format missing keys for output
 * @param {string[]} keys - Array of missing keys
 * @param {number} maxDisplay - Maximum number of keys to display
 * @returns {string} - Formatted string
 */
function formatMissingKeys(keys, maxDisplay = 20) {
  if (keys.length === 0) return '';

  const displayed = keys.slice(0, maxDisplay);
  const remaining = keys.length - maxDisplay;

  let output = displayed.map((key) => `      • ${key}`).join('\n');

  if (remaining > 0) {
    output += `\n      ... and ${remaining} more`;
  }

  return output;
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Checking i18n key parity between en.json and vi.json...\n');

  const rootDir = process.cwd();
  let hasErrors = false;
  let totalMissingInVi = 0;
  let totalMissingInEn = 0;

  for (const dir of TRANSLATION_DIRS) {
    const fullDir = path.join(rootDir, dir);

    if (!fs.existsSync(fullDir)) {
      console.warn(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const result = checkKeyParity(fullDir);

    if (result.error) {
      console.error(`❌ Error in ${dir}: ${result.error}`);
      hasErrors = true;
      continue;
    }

    const hasMissingInVi = result.missingInVi.length > 0;
    const hasMissingInEn = result.missingInEn.length > 0;
    const hasInvalidInEn = result.invalidInEn.length > 0;
    const hasInvalidInVi = result.invalidInVi.length > 0;

    if (hasMissingInVi || hasMissingInEn || hasInvalidInEn || hasInvalidInVi) {
      console.error(`❌ ${dir}:`);

      if (hasMissingInVi) {
        console.error(
          `\n   Missing in vi.json (${result.missingInVi.length} keys):`
        );
        console.error(formatMissingKeys(result.missingInVi));
        totalMissingInVi += result.missingInVi.length;
      }

      if (hasMissingInEn) {
        console.error(
          `\n   Missing in en.json (${result.missingInEn.length} keys):`
        );
        console.error(formatMissingKeys(result.missingInEn));
        totalMissingInEn += result.missingInEn.length;
      }

      if (hasInvalidInEn) {
        console.error(
          `\n   Invalid leaf values in en.json (${result.invalidInEn.length} keys):`
        );
        console.error(formatMissingKeys(result.invalidInEn));
      }

      if (hasInvalidInVi) {
        console.error(
          `\n   Invalid leaf values in vi.json (${result.invalidInVi.length} keys):`
        );
        console.error(formatMissingKeys(result.invalidInVi));
      }

      console.error('');
      hasErrors = true;
    } else {
      console.log(`✅ ${dir}: All keys are in sync`);
    }
  }

  console.log('');

  if (hasErrors) {
    console.error('─'.repeat(60));
    console.error('\n❌ Key parity check failed!\n');

    if (totalMissingInVi > 0) {
      console.error(`   • ${totalMissingInVi} key(s) missing in vi.json`);
    }
    if (totalMissingInEn > 0) {
      console.error(`   • ${totalMissingInEn} key(s) missing in en.json`);
    }

    console.error('\n💡 Add the missing keys to ensure translation parity.');
    console.error(
      '   You can use `bun i18n:sync` to auto-sync missing keys.\n'
    );
    process.exit(1);
  }

  console.log('✅ All translation files have matching keys!');
}

main();
