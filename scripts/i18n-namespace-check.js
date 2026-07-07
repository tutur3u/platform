#!/usr/bin/env node

/**
 * i18n Cross-App Namespace & Key Checker
 *
 * Verifies that:
 * 1. All translation namespaces used by shared packages
 *    (packages/ui, packages/satellite, and product UI packages) are present in
 *    every consuming app's messages/en.json.
 * 2. All individual translation keys (e.g. t('feedback')) used by shared
 *    packages exist under their namespace in every consuming app's en.json.
 *
 * This catches both:
 * - A shared component calling useTranslations('common') when the app lacks
 *   the 'common' namespace entirely.
 * - A shared component calling t('feedback') inside a useTranslations('common')
 *   context when the app has the 'common' namespace but lacks the 'feedback' key.
 *
 * Apps are registered in APPS (checked) or UNCHECKED_APPS (knowingly skipped);
 * a drift guard fails the run if any app ships shared UI + a message bundle but
 * is in neither list, so no app is ever silently skipped (the gap that let
 * apps/storefront ship without its `common` namespace). Minimal apps can use
 * APP_NAMESPACE_ALLOWLIST to restrict the check to just the shared namespaces
 * they actually render.
 *
 * 3. Namespace parity (NAMESPACE_PARITY_GROUPS): for namespaces consumed by a
 *    shared component or callback that receives a translator from outside the
 *    scanned source file, the key-level scan cannot attribute the calls. For
 *    those, the apps that render the component must keep the namespace in parity
 *    with each other — every listed app must contain every key any peer has.
 *
 * Usage:
 *   node scripts/i18n-namespace-check.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { checkNamespaceParity } = require('./i18n-namespace-parity');
const {
  checkAppSourceKeys,
  scanSourceKeys,
} = require('./i18n-source-key-scan');

const ROOT_DIR = process.cwd();

// Shared packages that may reference translation namespaces
const SHARED_PACKAGES = [
  { name: 'packages/ui', dir: 'packages/ui/src' },
  { name: 'packages/satellite', dir: 'packages/satellite/src' },
  { name: 'packages/mind-ui', dir: 'packages/mind-ui/src' },
  { name: 'packages/hive-ui', dir: 'packages/hive-ui/src' },
];

// Apps with translation files to check
const APPS = [
  { name: 'apps/web', dir: 'apps/web' },
  { name: 'apps/tasks', dir: 'apps/tasks' },
  { name: 'apps/calendar', dir: 'apps/calendar' },
  { name: 'apps/cms', dir: 'apps/cms' },
  { name: 'apps/drive', dir: 'apps/drive' },
  { name: 'apps/finance', dir: 'apps/finance' },
  { name: 'apps/hive', dir: 'apps/hive' },
  { name: 'apps/meet', dir: 'apps/meet' },
  { name: 'apps/mind', dir: 'apps/mind' },
  { name: 'apps/track', dir: 'apps/track' },
  { name: 'apps/nova', dir: 'apps/nova' },
  { name: 'apps/rewise', dir: 'apps/rewise' },
  { name: 'apps/storefront', dir: 'apps/storefront' },
  { name: 'apps/shortener', dir: 'apps/shortener' },
];

// Minimal apps that render only a small slice of the shared UI. Instead of the
// default "every shared namespace is required minus a long exception list",
// restrict the cross-app check for these apps to ONLY the listed namespaces —
// the shared UI they actually render (the account menu / dialogs use `common`).
// All other shared namespaces are implicitly ignored for the app.
const APP_NAMESPACE_ALLOWLIST = new Map([
  ['apps/storefront', new Set(['common'])],
  ['apps/shortener', new Set(['common'])],
]);

// Apps that ship message bundles and depend on shared UI but are intentionally
// NOT wired into the cross-app namespace check yet. Listed explicitly so the
// drift guard below does not silently skip them — adding a new app forces a
// conscious choice (wire it into APPS, or record it here). Remove an entry when
// you move the app into APPS.
const UNCHECKED_APPS = new Set([
  'apps/apps',
  'apps/chat',
  'apps/infrastructure',
  'apps/inventory',
  'apps/learn',
  'apps/mail',
  'apps/tools',
  'apps/teach',
]);

// Some satellite apps consume broad shared UI packages directly but only ship a
// narrow product namespace bundle. Keep their parity checks scoped to the
// shared product UI package that must render in both the satellite and apps/web.
const APP_SHARED_PACKAGE_SCOPES = new Map([
  ['apps/hive', new Set(['packages/hive-ui'])],
  ['apps/mind', new Set(['packages/mind-ui'])],
]);

// Bare root-qualified keys in shared packages need app-level rollout scopes:
// `useTranslations()` has no namespace signal, and packages/ui is too broad to
// require every app to carry every root key it contains. Add namespaces here as
// their consuming apps are confirmed.
const BARE_ROOT_KEY_APP_SCOPES = new Map([
  ['ws-invoices', new Set(['apps/finance'])],
  ['ws-task-boards', new Set(['apps/tasks', 'apps/web'])],
]);

// Namespaces that must stay in parity across the apps that render the shared
// component using them.
//
// The workspace-access component (packages/ui .../custom/workspace-access)
// renders members/roles/defaults in both apps/web and apps/cms and reads its
// strings via a bare `useTranslations()` (no namespace argument), plus the
// permission catalog in packages/utils which receives `t` as a parameter.
// Neither is visible to the namespace/key scans above, so an app can ship the
// component while missing keys and render raw text (e.g. "ws-roles.guest_defaults").
//
// Only apps that actually render the component are listed — most apps carry a
// (historically duplicated) ws-roles/ws-members namespace but never render it,
// so requiring these keys everywhere would be pure noise. Each group requires
// every listed app to contain every key any peer app has, per namespace.
const NAMESPACE_PARITY_GROUPS = [
  {
    apps: ['apps/web', 'apps/cms'],
    namespaces: ['ws-roles', 'ws-members'],
  },
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
 * Scan a shared package for translation key references.
 *
 * For each source file, extracts static translator calls with the shared source
 * scanner. Named namespace keys keep the legacy conservative behavior: only
 * files with exactly one named namespace and no bare translator are checked.
 * Bare translators are checked only when the key is root-qualified, e.g.
 * t('ws-invoices.prepaid_months').
 *
 * Returns an array of { namespace, key, file } objects.
 */
function scanPackageKeys(pkg) {
  const scannedKeys = scanSourceKeys(ROOT_DIR, pkg.dir);
  const fileStats = new Map();

  for (const item of scannedKeys) {
    if (!fileStats.has(item.file)) {
      fileStats.set(item.file, {
        hasBareTranslator: false,
        namedNamespaces: new Set(),
      });
    }

    const stats = fileStats.get(item.file);
    if (item.namespace) {
      stats.namedNamespaces.add(item.namespace);
    } else {
      stats.hasBareTranslator = true;
    }
  }

  return scannedKeys.filter((item) => {
    const stats = fileStats.get(item.file);

    if (!item.namespace) {
      return item.key.includes('.');
    }

    return !stats.hasBareTranslator && stats.namedNamespaces.size === 1;
  });
}

/**
 * Build brace pairs with comments and strings skipped. This is not a full TS
 * parser, but it is enough to bound local translator declarations to their
 * enclosing block and avoid collapsing repeated `const t = useTranslations(...)`
 * declarations in one file.
 */
/**
 * Resolve a dotted path (namespace + key) in a JSON object.
 * Returns true if the path exists.
 *
 * Example: resolveKeyPath(json, 'common', 'feedback') checks json.common.feedback
 * Example: resolveKeyPath(json, 'task-projects.edit_dialog', 'title')
 *          checks json['task-projects']['edit_dialog']['title']
 */
function resolveKeyPath(json, namespace, key) {
  const segments = [
    ...(namespace ? namespace.split('.') : []),
    ...key.split('.'),
  ];
  let current = json;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return false;
    if (!(segment in current)) return false;
    current = current[segment];
  }

  return current !== null && current !== undefined;
}

/**
 * Find apps that ship a messages/en.json AND depend on a shared UI package but
 * are registered in neither APPS (checked) nor UNCHECKED_APPS (knowingly
 * skipped). These would otherwise be validated by nothing — the exact gap that
 * let apps/storefront ship without its `common` namespace. Returns app names.
 */
function findUnregisteredApps() {
  const appsDir = path.join(ROOT_DIR, 'apps');
  if (!fs.existsSync(appsDir)) return [];

  const registered = new Set([
    ...APPS.map((app) => app.name),
    ...UNCHECKED_APPS,
  ]);
  const sharedDepNames = [
    '@tuturuuu/ui',
    '@tuturuuu/satellite',
    '@tuturuuu/mind-ui',
    '@tuturuuu/hive-ui',
  ];
  const unregistered = [];

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appName = `apps/${entry.name}`;
    if (registered.has(appName)) continue;

    const enJsonPath = path.join(appsDir, entry.name, 'messages', 'en.json');
    const pkgJsonPath = path.join(appsDir, entry.name, 'package.json');
    if (!fs.existsSync(enJsonPath) || !fs.existsSync(pkgJsonPath)) continue;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };
    if (sharedDepNames.some((dep) => allDeps[dep])) {
      unregistered.push(appName);
    }
  }

  return unregistered.sort();
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
  if (allDeps['@tuturuuu/mind-ui']) deps.add('packages/mind-ui');
  if (allDeps['@tuturuuu/hive-ui']) deps.add('packages/hive-ui');

  const scopedPackages = APP_SHARED_PACKAGE_SCOPES.get(appDir);
  if (scopedPackages) {
    return new Set([...deps].filter((dep) => scopedPackages.has(dep)));
  }

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
  const fullPath = namespace ? `${namespace}.${key}` : key;

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

    // --- Namespace-level check ---
    const allowlist = APP_NAMESPACE_ALLOWLIST.get(app.name) ?? null;
    const requiredNamespaces = new Map();
    for (const dep of appDeps) {
      const pkgNs = packageNamespaces.get(dep);
      if (!pkgNs) continue;

      for (const [namespace] of pkgNs) {
        // For minimal apps, only validate the allowlisted shared namespaces.
        if (allowlist && !allowlist.has(namespace)) continue;
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
          const topLevel = getTopLevelNamespace(namespace || key);

          // For minimal apps, only validate keys in allowlisted namespaces.
          if (allowlist && !allowlist.has(topLevel)) continue;

          if (!namespace) {
            const scopedApps = BARE_ROOT_KEY_APP_SCOPES.get(topLevel);
            if (!scopedApps?.has(app.name)) continue;
          }

          // Skip if namespace is in the ignore list
          if (ignoredNamespaces.has(topLevel)) continue;

          // Named namespace misses are already reported by the namespace-level
          // check. Bare root-qualified keys have no separate namespace signal,
          // so report them as missing keys.
          if (!appNamespaces.has(topLevel)) {
            if (!namespace) missingKeys.push({ namespace, key, file });
            continue;
          }

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
          const fullPath = namespace ? `${namespace}.${key}` : key;
          console.log(`    - ${fullPath} (used in ${fileList})`);
        }
      }
    }
  }

  // Step 4: App registry drift guard — fail if an app ships shared UI + a
  // message bundle but is registered in neither APPS nor UNCHECKED_APPS.
  const appSourceFailures = checkAppSourceKeys({
    exceptions,
    rootDir: ROOT_DIR,
  });
  if (appSourceFailures.length > 0) {
    hasFailures = true;
    console.log('Checking app source translation keys...\n');
    for (const { appDir, missing } of appSourceFailures) {
      console.log(
        `  ${appDir}: MISSING ${missing.length} app source translation key${missing.length > 1 ? 's' : ''}`
      );
      for (const { namespace, key, files } of missing) {
        const fullPath = namespace ? `${namespace}.${key}` : key;
        console.log(`    - ${fullPath} (used in ${[...files].join(', ')})`);
      }
    }
    console.log('');
  }

  // Step 5: App registry drift guard — fail if an app ships shared UI + a
  // message bundle but is registered in neither APPS nor UNCHECKED_APPS.
  const unregisteredApps = findUnregisteredApps();
  if (unregisteredApps.length > 0) {
    hasFailures = true;
    console.log('App registry drift detected...\n');
    console.log(
      `  ${unregisteredApps.length} app${unregisteredApps.length > 1 ? 's' : ''} ship shared UI + message bundles but are neither checked (APPS) nor explicitly skipped (UNCHECKED_APPS):`
    );
    for (const appName of unregisteredApps) {
      console.log(`    - ${appName}`);
    }
    console.log('');
  }

  // Step 6: Namespace parity check across apps that render the same shared
  // (bare-useTranslations) component.
  const parityFailures = checkNamespaceParity(
    NAMESPACE_PARITY_GROUPS,
    getAppTranslations
  );
  if (parityFailures.length > 0) {
    hasFailures = true;
    console.log('Checking namespace parity...\n');
    for (const { appDir, namespace, missing } of parityFailures) {
      console.log(
        `  ${appDir}: out of parity in "${namespace}" — MISSING ${missing.length} key${missing.length > 1 ? 's' : ''}`
      );
      for (const key of missing) {
        console.log(`    - ${namespace}.${key}`);
      }
    }
    console.log('');
  }

  if (hasFailures) {
    console.log(
      "Fix: Add missing namespaces/keys to the affected app's messages/en.json and vi.json"
    );
    console.log(
      'If a namespace is intentionally unused, add it to the namespace list in scripts/i18n-namespace-check.config.json'
    );
    console.log(
      'If specific keys are unused, add patterns (e.g. "namespace.*") to the keyExceptions section'
    );
    console.log(
      'For parity failures, sync the namespace across the apps in NAMESPACE_PARITY_GROUPS (apps that render the same shared component)\n'
    );
    process.exit(1);
  }

  console.log('All namespace and key checks passed!\n');
}

main();
