const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  inventory,
  assertNoCheckScripts,
} = require('./ci/bun-check-inventory.js');
const { getActiveChecks, isCheckQueueProcess } = require('./check.js');
const root = path.resolve(__dirname, '..');

test('root and every workspace reserve check for the native Bun checker', () => {
  assertNoCheckScripts(inventory(root));
  const scripts = require('../package.json').scripts;
  assert.equal(scripts.validate, 'node scripts/check.js');
  assert.equal(scripts['validate:now'], 'node scripts/check.js --force-now');
  assert.equal(Object.hasOwn(scripts, 'check:now'), false);
});

test('a shadowing script fails even if it is empty or lives in a workspace', () => {
  for (const file of [
    'package.json',
    'apps/calendar/package.json',
    'packages/utils/package.json',
  ]) {
    assert.throws(
      () => assertNoCheckScripts([{ file, scripts: { check: '' } }]),
      /shadows native bun check/
    );
  }
});

test('validate retains every existing aggregate component and conditional gate', () => {
  const checks = getActiveChecks({
    changedFiles: ['platform-version.txt', 'apps/discord/main.py'],
  });
  assert.deepEqual(
    checks.map((check) => check.name),
    [
      'tests',
      'type-check',
      'biome',
      'source-size',
      'public-seo-routes',
      'server-console',
      'internal-app-auth',
      'satellite-cookie-auth',
      'browser-session-surface',
      'offline-worker-wiring',
      'multi-account-vault-owner',
      'legacy-api-route-wrappers',
      'platform-release-version',
      'mobile-ios-project-settings',
      'mobile-api-mappings',
      'script-tests',
      'discord-python',
      'i18n-check',
      'next-intl-setup',
      'i18n-key-parity',
      'i18n-sort',
      'i18n-namespace-check',
      'migration-timestamps',
    ]
  );
});

test('force-now recognizes validate and legacy runner processes but never native bun check', () => {
  for (const command of [
    'bun validate',
    'bun run validate:now',
    '/usr/bin/node /repo/scripts/check.js',
  ]) {
    assert.equal(
      isCheckQueueProcess(123, { readProcessCommand: () => command }),
      true,
      command
    );
  }
  for (const command of [
    'bun check',
    'bun check --no-script --threads 6',
    'bun run check:changed',
  ]) {
    assert.equal(
      isCheckQueueProcess(123, { readProcessCommand: () => command }),
      false,
      command
    );
  }
});
