#!/usr/bin/env node

/**
 * i18n Cross-App Namespace & Key Checker
 *
 * Verifies that:
 * 1. All translation namespaces used by shared packages
 *    (packages/ui, packages/satellite) are present in every consuming app's
 *    messages/en.json.
 * 2. All individual translation keys (e.g. t('feedback')) used by shared
 *    packages exist under their namespace in every consuming app's en.json.
 *
 * This catches both:
 * - A shared component calling useTranslations('common') when the app lacks
 *   the 'common' namespace entirely.
 * - A shared component calling t('feedback') inside a useTranslations('common')
 *   context when the app has the 'common' namespace but lacks the 'feedback' key.
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

// Regex to match t('key'), t.rich('key'), t.raw('key'), t.has('key'), t.markup('key')
// Only matches static string literal keys — skips template literals and variables
const KEY_REGEX =
  /\bt(?:\.(?:rich|raw|has|markup))?\(\s*['"]([^'"]+)['"]\s*[,)]/g;

// Regex to detect bare useTranslations() calls (no namespace argument).
// Files with bare calls use a root-level `t` that overlaps with KEY_REGEX,
// so we skip key-level checking for those files to avoid false positives.
const BARE_TRANSLATIONS_REGEX = /(?:useTranslations|getTranslations)\(\s*\)/g;

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
 * Scan a shared package for translation key references.
 *
 * For each source file, extracts:
 *   - The namespace(s) from useTranslations('ns') / getTranslations('ns')
 *   - Static t('key') / t.rich('key') / t.raw('key') / t.has('key') calls
 *
 * When a file has exactly one distinct namespace, all static keys are
 * associated with it. Files with zero namespaces (no useTranslations call),
 * multiple different namespaces, or only bare useTranslations() (no arg)
 * are skipped for key-level checking (namespace-level still applies).
 *
 * Returns an array of { namespace, key, file } objects.
 */
function scanPackageKeys(pkg) {
  const results = [];
  const files = findSourceFiles(pkg.dir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(ROOT_DIR, filePath);

    // Skip files that have bare useTranslations() calls (no namespace arg).
    // These create a root-level `t` whose calls overlap with KEY_REGEX,
    // leading to false positives when the file also has named namespaces.
    BARE_TRANSLATIONS_REGEX.lastIndex = 0;
    if (BARE_TRANSLATIONS_REGEX.test(content)) continue;

    // Collect all distinct namespaces in this file
    const fileNamespaces = new Set();
    NAMESPACE_REGEX.lastIndex = 0;
    let match;

    // biome-ignore lint/suspicious/noAssignInExpressions: <>
    while ((match = NAMESPACE_REGEX.exec(content)) !== null) {
      fileNamespaces.add(match[1]);
    }

    // Skip files with 0 or multiple different namespaces
    if (fileNamespaces.size !== 1) continue;

    const namespace = [...fileNamespaces][0];

    // Collect all static keys
    KEY_REGEX.lastIndex = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: <>
    while ((match = KEY_REGEX.exec(content)) !== null) {
      results.push({ namespace, key: match[1], file: relPath });
    }
  }

  return results;
}

/**
 * Resolve a dotted path (namespace + key) in a JSON object.
 * Returns true if the path exists.
 *
 * Example: resolveKeyPath(json, 'common', 'feedback') checks json.common.feedback
 * Example: resolveKeyPath(json, 'task-projects.edit_dialog', 'title')
 *          checks json['task-projects']['edit_dialog']['title']
 */
function resolveKeyPath(json, namespace, key) {
  const segments = [...namespace.split('.'), ...key.split('.')];
  let current = json;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return false;
    if (!(segment in current)) return false;
    current = current[segment];
  }

  return true;
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
 * Load full JSON from an app's en.json for key-level checking
 */
function getAppTranslations(appDir) {
  const enJsonPath = path.join(ROOT_DIR, appDir, 'messages', 'en.json');
  if (!fs.existsSync(enJsonPath)) return null;

  return JSON.parse(fs.readFileSync(enJsonPath, 'utf-8'));
}

/**
 * Load exception config.
 *
 * The config has two sections:
 *   - Top-level keys (per-app arrays) for namespace exceptions (unchanged).
 *   - "keyExceptions" object (per-app arrays) for key-level exceptions.
 *
 * Key exceptions support:
 *   - "namespace.*"     — skip all keys under this namespace
 *   - "namespace.key"   — skip a specific key
 */
function loadExceptions() {
  const configPath = path.join(
    ROOT_DIR,
    'scripts',
    'i18n-namespace-check.config.json'
  );
  if (!fs.existsSync(configPath)) return {};

  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Check if a namespace+key combination is covered by a key exception pattern.
 *
 * Exception patterns are matched against the full path: namespace + key.
 * For example, useTranslations('settings.tasks') + t('submit_shortcut')
 * produces the full path "settings.tasks.submit_shortcut".
 *
 * Supported patterns:
 *   "settings.*"                         — matches all keys under settings.*
 *   "settings.tasks.*"                   — matches keys under settings.tasks.*
 *   "settings.tasks.submit_shortcut"     — matches exact key
 *
 * @param {Set<string>} keyExceptionSet - Set of exception patterns for the app
 * @param {string} namespace - Full namespace (e.g. 'common', 'settings.tasks')
 * @param {string} key - Translation key (e.g. 'feedback', 'submit_shortcut')
 * @returns {boolean} true if this key should be skipped
 */
function isKeyExcepted(keyExceptionSet, namespace, key) {
  const fullPath = `${namespace}.${key}`;

  // Check exact match: "namespace.key"
  if (keyExceptionSet.has(fullPath)) return true;

  // Check wildcard at every level of the full path.
  // e.g. for "settings.tasks.submit_shortcut", check:
  //   "settings.*", "settings.tasks.*"
  const segments = fullPath.split('.');
  for (let i = 1; i < segments.length; i++) {
    const prefix = `${segments.slice(0, i).join('.')}.*`;
    if (keyExceptionSet.has(prefix)) return true;
  }

  return false;
}

/**
 * Main function
 */
function main() {
  console.log('Scanning shared packages for translation namespaces...\n');

  // Step 1: Scan shared packages for namespaces and keys
  const packageNamespaces = new Map();
  const packageKeys = new Map();
  for (const pkg of SHARED_PACKAGES) {
    const namespaces = scanPackageNamespaces(pkg);
    const keys = scanPackageKeys(pkg);
    packageNamespaces.set(pkg.name, namespaces);
    packageKeys.set(pkg.name, keys);
    console.log(
      `  ${pkg.name}: ${namespaces.size} namespaces, ${keys.length} static keys found`
    );
  }

  console.log('');

  // Step 2: Load exception config
  const exceptions = loadExceptions();

  // Step 3: Check each app — namespaces first, then keys
  console.log('Checking apps...\n');
  let hasFailures = false;

  for (const app of APPS) {
    const appDeps = getAppDependencies(app.dir);
    const appNamespaces = getAppNamespaces(app.dir);

    if (appNamespaces === null) {
      console.log(`  ${app.name}: SKIPPED (no messages/en.json)`);
      continue;
    }

    // --- Namespace-level check (unchanged) ---
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

    const ignoredNamespaces = new Set(exceptions[app.name] || []);

    const missingNamespaces = [];
    let ignoredCount = 0;

    for (const [namespace, sources] of requiredNamespaces) {
      if (ignoredNamespaces.has(namespace)) {
        ignoredCount++;
        continue;
      }
      if (!appNamespaces.has(namespace)) {
        missingNamespaces.push({
          namespace,
          sources: [...sources],
        });
      }
    }

    // --- Key-level check (new) ---
    const appJson = getAppTranslations(app.dir);
    const missingKeys = [];
    const appKeyExceptions = new Set(
      exceptions.keyExceptions?.[app.name] || []
    );

    if (appJson) {
      for (const dep of appDeps) {
        const keys = packageKeys.get(dep);
        if (!keys) continue;

        for (const { namespace, key, file } of keys) {
          const topLevel = getTopLevelNamespace(namespace);

          // Skip if namespace is in the ignore list
          if (ignoredNamespaces.has(topLevel)) continue;

          // Skip key check if the entire namespace is missing
          // (already reported as namespace error)
          if (!appNamespaces.has(topLevel)) continue;

          // Skip if key is in the key exception list
          if (isKeyExcepted(appKeyExceptions, namespace, key)) continue;

          if (!resolveKeyPath(appJson, namespace, key)) {
            missingKeys.push({ namespace, key, file });
          }
        }
      }
    }

    // --- Report ---
    if (missingNamespaces.length === 0 && missingKeys.length === 0) {
      const parts = [];
      if (ignoredCount > 0) parts.push(`${ignoredCount} ignored`);
      const checked = requiredNamespaces.size - ignoredCount;
      parts.push(`${checked} namespaces present`);
      console.log(`  ${app.name}: OK (${parts.join(', ')})`);
    } else {
      hasFailures = true;

      if (missingNamespaces.length > 0) {
        console.log(
          `  ${app.name}: MISSING ${missingNamespaces.length} namespace${missingNamespaces.length > 1 ? 's' : ''}`
        );
        for (const { namespace, sources } of missingNamespaces.sort((a, b) =>
          a.namespace.localeCompare(b.namespace)
        )) {
          console.log(`    - ${namespace} (used in ${sources.join(', ')})`);
        }
      }

      if (missingKeys.length > 0) {
        // Deduplicate keys (same namespace+key may appear in multiple files)
        const uniqueKeys = new Map();
        for (const { namespace, key, file } of missingKeys) {
          const id = `${namespace}::${key}`;
          if (!uniqueKeys.has(id)) {
            uniqueKeys.set(id, { namespace, key, files: new Set() });
          }
          uniqueKeys.get(id).files.add(file);
        }

        const sortedKeys = [...uniqueKeys.values()].sort((a, b) => {
          const nsCmp = a.namespace.localeCompare(b.namespace);
          return nsCmp !== 0 ? nsCmp : a.key.localeCompare(b.key);
        });

        if (missingNamespaces.length === 0) {
          console.log(
            `  ${app.name}: MISSING ${sortedKeys.length} translation key${sortedKeys.length > 1 ? 's' : ''}`
          );
        } else {
          console.log(
            `    + ${sortedKeys.length} missing key${sortedKeys.length > 1 ? 's' : ''}`
          );
        }

        for (const { namespace, key, files } of sortedKeys) {
          const fileList = [...files].join(', ');
          console.log(`    - ${namespace}.${key} (used in ${fileList})`);
        }
      }
    }
  }

  console.log('');

  if (hasFailures) {
    console.log(
      "Fix: Add missing namespaces/keys to the affected app's messages/en.json and vi.json"
    );
    console.log(
      'If a namespace is intentionally unused, add it to the namespace list in scripts/i18n-namespace-check.config.json'
    );
    console.log(
      'If specific keys are unused, add patterns (e.g. "namespace.*") to the keyExceptions section\n'
    );
    process.exit(1);
  }

  console.log('All namespace and key checks passed!\n');
}

main();
