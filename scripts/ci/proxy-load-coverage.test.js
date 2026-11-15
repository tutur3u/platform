const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const appsRoot = path.join(repoRoot, 'apps');
// A test loads the proxy when it imports the module that sits next to it.
const PROXY_IMPORT =
  /(?:from\s+|import\(\s*)['"](?:\.\/|(?:\.\.\/)+|@\/)proxy['"]/u;

// Apps whose unit tests are not wired into CI yet: they have no `test` script,
// so scripts/ci/test-shards.js never runs them. This list may only shrink; an
// entry that gains a test script must be removed (asserted below).
const UNWIRED_TEST_APPS = new Set(['external', 'inventory', 'tools', 'track']);

function testFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(full));
    else if (/\.test\.tsx?$/u.test(entry.name)) found.push(full);
  }
  return found;
}

function satelliteProxyApps() {
  return fs
    .readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((app) => fs.existsSync(path.join(appsRoot, app, 'src/proxy.ts')))
    .sort();
}

test('every satellite proxy is loaded by its own app unit tests', () => {
  const apps = satelliteProxyApps();
  assert.ok(apps.length > 0, 'expected satellite proxies under apps/*/src');
  const gaps = [];
  for (const app of apps) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(appsRoot, app, 'package.json'), 'utf8')
    );
    // Unit shards (scripts/ci/test-shards.js) only run packages with a test script.
    if (UNWIRED_TEST_APPS.has(app)) {
      if (manifest.scripts?.test)
        gaps.push(
          `${app}: now has a test script; remove it from the unwired list`
        );
      continue;
    }
    if (!manifest.scripts?.test) {
      gaps.push(`${app}: no test script, so its unit tests never run`);
      continue;
    }
    const loads = testFiles(path.join(appsRoot, app, 'src')).some((file) =>
      PROXY_IMPORT.test(fs.readFileSync(file, 'utf8'))
    );
    if (!loads) gaps.push(`${app}: no unit test imports src/proxy.ts`);
  }
  assert.deepEqual(gaps, []);
  for (const app of UNWIRED_TEST_APPS)
    assert.ok(apps.includes(app), `${app} no longer has a satellite proxy`);
});

test('the proxy import pattern matches the forms the apps use', () => {
  for (const source of [
    "import { proxy } from './proxy';",
    "import { proxy } from '../proxy';",
    "const module = await import('./proxy');",
    "const module = await import('../proxy');",
    "import { proxy } from '@/proxy';",
  ])
    assert.match(source, PROXY_IMPORT, source);
  for (const source of [
    "import { proxy } from '@tuturuuu/auth/proxy';",
    "import { x } from './proxy-utils';",
    "import { x } from './api-proxy';",
  ])
    assert.doesNotMatch(source, PROXY_IMPORT, source);
});
