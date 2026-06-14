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
const {
  discoverTranslationDirs,
  getAllKeyPaths,
  getNestedValue,
  getProjectRoot,
  setNestedValue,
  sortObjectKeysDeep,
} = require('./i18n-common');

/**
 * Process a translation directory
 */
function processDirectory(dir) {
  const rootDir = getProjectRoot();
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

  const translationDirs = discoverTranslationDirs();

  for (const dir of translationDirs) {
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
