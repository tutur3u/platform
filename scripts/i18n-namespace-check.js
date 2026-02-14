#!/usr/bin/env node

/**
 * i18n Cross-App Namespace Checker
 *
 * Verifies that all translation namespaces used by shared packages
 * (packages/ui, packages/satellite) are present in every consuming app's
 * messages/en.json.
 *
 * This catches the case where a shared component calls
 * useTranslations('some-namespace') but a satellite app doesn't have
 * that namespace in its translation files — causing silent runtime failures.
 *
 * Usage:
 *   node scripts/i18n-namespace-check.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = process.cwd();

// Shared packages that may reference translation namespaces
const SHARED_PACKAGES = [
  { name: 'packages/ui', dir: 'packages/ui/src' },
  { name: 'packages/satellite', dir: 'packages/satellite/src' },
];

// Apps with translation files to check
const APPS = [
  { name: 'apps/web', dir: 'apps/web' },
  { name: 'apps/tasks', dir: 'apps/tasks' },
  { name: 'apps/calendar', dir: 'apps/calendar' },
  { name: 'apps/finance', dir: 'apps/finance' },
  { name: 'apps/meet', dir: 'apps/meet' },
  { name: 'apps/track', dir: 'apps/track' },
  { name: 'apps/nova', dir: 'apps/nova' },
  { name: 'apps/rewise', dir: 'apps/rewise' },
];

// Regex to match useTranslations('namespace') and getTranslations('namespace')
const NAMESPACE_REGEX =
  /(?:useTranslations|getTranslations)\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Recursively find all .ts/.tsx/.js/.jsx files in a directory
 */
function findSourceFiles(dir) {
  const results = [];
  const fullDir = path.join(ROOT_DIR, dir);

  if (!fs.existsSync(fullDir)) return results;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '__tests__'
        ) {
          continue;
        }
        walk(fullPath);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(fullDir);
  return results;
}

/**
 * Extract the top-level namespace from a potentially dotted namespace path.
 * In next-intl, useTranslations('settings.calendar') resolves as
 * messages["settings"]["calendar"], so the required top-level key is "settings".
 */
function getTopLevelNamespace(namespace) {
  const dotIndex = namespace.indexOf('.');
  return dotIndex === -1 ? namespace : namespace.substring(0, dotIndex);
}

/**
 * Scan a shared package for translation namespace references
 * Returns a Map of top-level namespace -> Set of package names where it's used
 */
function scanPackageNamespaces(pkg) {
  const namespaces = new Map();
  const files = findSourceFiles(pkg.dir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;

    // Reset regex lastIndex for each file
    NAMESPACE_REGEX.lastIndex = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: <>
    while ((match = NAMESPACE_REGEX.exec(content)) !== null) {
      const topLevel = getTopLevelNamespace(match[1]);
      if (!namespaces.has(topLevel)) {
        namespaces.set(topLevel, new Set());
      }
      namespaces.get(topLevel).add(path.relative(ROOT_DIR, filePath));
    }
  }

  return namespaces;
}

/**
 * Check which shared packages an app depends on
 */
function getAppDependencies(appDir) {
  const pkgJsonPath = path.join(ROOT_DIR, appDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return new Set();

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
  };

  const deps = new Set();
  if (allDeps['@tuturuuu/ui']) deps.add('packages/ui');
  if (allDeps['@tuturuuu/satellite']) deps.add('packages/satellite');
  return deps;
}

/**
 * Get top-level keys from an app's en.json
 */
function getAppNamespaces(appDir) {
  const enJsonPath = path.join(ROOT_DIR, appDir, 'messages', 'en.json');
  if (!fs.existsSync(enJsonPath)) return null;

  const content = JSON.parse(fs.readFileSync(enJsonPath, 'utf-8'));
  return new Set(Object.keys(content));
}

/**
 * Load exception config
 */
function loadExceptions() {
  const configPath = path.join(ROOT_DIR, 'i18n-namespace-check.config.json');
  if (!fs.existsSync(configPath)) return {};

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Main function
 */
function main() {
  console.log('Scanning shared packages for translation namespaces...\n');

  // Step 1: Scan shared packages
  const packageNamespaces = new Map();
  for (const pkg of SHARED_PACKAGES) {
    const namespaces = scanPackageNamespaces(pkg);
    packageNamespaces.set(pkg.name, namespaces);
    console.log(`  ${pkg.name}: ${namespaces.size} namespaces found`);
  }

  console.log('');

  // Step 2: Load exception config
  const exceptions = loadExceptions();

  // Step 3: Check each app
  console.log('Checking apps...\n');
  let hasFailures = false;

  for (const app of APPS) {
    const appDeps = getAppDependencies(app.dir);
    const appNamespaces = getAppNamespaces(app.dir);

    if (appNamespaces === null) {
      console.log(`  ${app.name}: SKIPPED (no messages/en.json)`);
      continue;
    }

    // Compute required namespaces from dependencies
    const requiredNamespaces = new Map();
    for (const dep of appDeps) {
      const pkgNs = packageNamespaces.get(dep);
      if (!pkgNs) continue;

      for (const [namespace] of pkgNs) {
        if (!requiredNamespaces.has(namespace)) {
          requiredNamespaces.set(namespace, new Set());
        }
        requiredNamespaces.get(namespace).add(dep);
      }
    }

    // Get ignored namespaces for this app
    const ignoredNamespaces = new Set(exceptions[app.name] || []);

    // Check for missing namespaces
    const missing = [];
    let ignoredCount = 0;

    for (const [namespace, sources] of requiredNamespaces) {
      if (ignoredNamespaces.has(namespace)) {
        ignoredCount++;
        continue;
      }
      if (!appNamespaces.has(namespace)) {
        missing.push({
          namespace,
          sources: [...sources],
        });
      }
    }

    if (missing.length === 0) {
      const parts = [];
      if (ignoredCount > 0) parts.push(`${ignoredCount} ignored`);
      const checked = requiredNamespaces.size - ignoredCount;
      parts.push(`${checked} present`);
      console.log(`  ${app.name}: OK (${parts.join(', ')})`);
    } else {
      hasFailures = true;
      console.log(
        `  ${app.name}: MISSING ${missing.length} namespace${missing.length > 1 ? 's' : ''}`
      );
      for (const { namespace, sources } of missing.sort((a, b) =>
        a.namespace.localeCompare(b.namespace)
      )) {
        console.log(`    - ${namespace} (used in ${sources.join(', ')})`);
      }
    }
  }

  console.log('');

  if (hasFailures) {
    console.log(
      "Fix: Add missing namespaces to the affected app's messages/en.json and vi.json"
    );
    console.log(
      'If a namespace is intentionally unused, add it to i18n-namespace-check.config.json\n'
    );
    process.exit(1);
  }

  console.log('All namespace checks passed!\n');
}

main();
