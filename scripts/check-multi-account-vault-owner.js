#!/usr/bin/env node

/**
 * Multi-account vault ownership check.
 *
 * The web multi-account vault (`apps/web/src/lib/auth/multi-account`) owns
 * device cookies, encrypted Supabase sessions, and the account-switch handover.
 * `apps/web` is the only app that serves `/api/v1/auth/accounts/*`, so it is the
 * only app that should carry that code.
 *
 * `apps/infrastructure` used to hold a byte-for-byte copy of it with no
 * consumers. Nothing imported it, so nothing tested it and nothing failed when
 * it drifted: it was hand-synced once during a cross-app change and then missed
 * two production bug fixes outright, all while looking like live auth code.
 *
 * If another app genuinely needs vault behavior, extract it into a shared
 * package that both apps import — do not copy the directory.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const APPS_DIR_RELATIVE_PATH = 'apps';
const VAULT_RELATIVE_PATH = path.join('src', 'lib', 'auth', 'multi-account');
const VAULT_OWNER_APP = 'web';

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

function findViolations(root = REPO_ROOT) {
  const appsDir = path.join(root, APPS_DIR_RELATIVE_PATH);

  return listDirectories(appsDir)
    .filter((appName) => appName !== VAULT_OWNER_APP)
    .filter((appName) =>
      fs.existsSync(path.join(appsDir, appName, VAULT_RELATIVE_PATH))
    )
    .map((appName) =>
      path.join(APPS_DIR_RELATIVE_PATH, appName, VAULT_RELATIVE_PATH)
    )
    .sort((left, right) => left.localeCompare(right));
}

function run() {
  const violations = findViolations(REPO_ROOT);

  if (violations.length === 0) {
    process.stdout.write('Multi-account vault ownership check passed.\n');
    return;
  }

  const lines = [
    'Multi-account vault ownership check failed.',
    `Only apps/${VAULT_OWNER_APP} may carry the multi-account vault, but found:`,
    ...violations.map((directory) => ` - ${directory}`),
    '',
    'A copy has no consumers and no tests, so it silently misses auth fixes.',
    'Delete it, or extract the shared behavior into a package both apps import.',
  ];

  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

if (require.main === module) {
  run();
}

module.exports = {
  VAULT_OWNER_APP,
  VAULT_RELATIVE_PATH,
  findViolations,
};
