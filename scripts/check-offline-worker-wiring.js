#!/usr/bin/env node

/**
 * Offline worker wiring check.
 *
 * `OfflineProvider` registers a service worker at `/serwist/sw.js`. That URL is
 * only served by apps that also expose the build-time worker route
 * (`src/app/serwist/[path]/route.ts`, from `createOfflineRoute`).
 *
 * Copying an app layout without that route leaves the provider registering a
 * worker that 404s, which throws
 * "[offline] Failed to register the service worker" into the console on every
 * page load. Six apps had drifted into that state before this check existed.
 *
 * An app may legitimately want no offline support — it just has to say so with
 * `<OfflineProvider register={false}>`, which is what apps without the route do.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const APPS_DIR_RELATIVE_PATH = 'apps';
const WORKER_ROUTE_RELATIVE_PATH = path.join(
  'src',
  'app',
  'serwist',
  '[path]',
  'route.ts'
);
const PROVIDER_TAG_PATTERN = /<(?:OfflineProvider|SerwistProvider)\b[^>]*>/gu;
const REGISTRATION_DISABLED_PATTERN = /register=\{false\}/u;

function listDirectories(directory) {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function collectTsxFiles(directory) {
  let entries;

  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      files.push(...collectTsxFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Provider usages that leave service worker registration enabled. */
function findRegisteringProviderUsages(source) {
  return [...source.matchAll(PROVIDER_TAG_PATTERN)]
    .map((match) => match[0])
    .filter((tag) => !REGISTRATION_DISABLED_PATTERN.test(tag));
}

function servesOfflineWorker(appDir) {
  return fs.existsSync(path.join(appDir, WORKER_ROUTE_RELATIVE_PATH));
}

function findViolations(root = REPO_ROOT) {
  const appsDir = path.join(root, APPS_DIR_RELATIVE_PATH);
  const violations = [];

  for (const appName of listDirectories(appsDir)) {
    const appDir = path.join(appsDir, appName);

    if (servesOfflineWorker(appDir)) {
      continue;
    }

    for (const filePath of collectTsxFiles(path.join(appDir, 'src'))) {
      const source = fs.readFileSync(filePath, 'utf8');

      if (findRegisteringProviderUsages(source).length === 0) {
        continue;
      }

      violations.push(path.relative(root, filePath));
    }
  }

  return violations.sort((left, right) => left.localeCompare(right));
}

function run() {
  const violations = findViolations(REPO_ROOT);

  if (violations.length === 0) {
    process.stdout.write('Offline worker wiring check passed.\n');
    return;
  }

  const lines = [
    'Offline worker wiring check failed.',
    'These apps register a service worker they do not serve, so every page load',
    'logs a failed registration for /serwist/sw.js:',
    ...violations.map((filePath) => ` - ${filePath}`),
    '',
    `Either add ${WORKER_ROUTE_RELATIVE_PATH} (see apps/web) so the app serves`,
    'the worker, or pass <OfflineProvider register={false}> to opt out.',
  ];

  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = {
  findRegisteringProviderUsages,
  findViolations,
  servesOfflineWorker,
};
