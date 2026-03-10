const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const appsDir = path.join(repoRoot, 'apps');

function getNextApps() {
  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((appName) => {
      const packageJsonPath = path.join(appsDir, appName, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return false;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return Boolean(packageJson.dependencies?.next);
    });
}

test('every Next app under apps/ has a src/proxy.ts file', () => {
  const apps = getNextApps();

  for (const appName of apps) {
    const proxyPath = path.join(appsDir, appName, 'src', 'proxy.ts');
    assert.ok(
      fs.existsSync(proxyPath),
      `Expected ${appName} to define ${path.relative(repoRoot, proxyPath)}`
    );
  }
});

test('every app proxy uses the shared API guard or the web-specific guard path', () => {
  const apps = getNextApps();

  for (const appName of apps) {
    const proxyPath = path.join(appsDir, appName, 'src', 'proxy.ts');
    const source = fs.readFileSync(proxyPath, 'utf8');

    if (appName === 'web') {
      assert.match(
        source,
        /validateRequestEmojiLimit|guardApiProxyRequest/,
        `Expected ${appName} proxy to validate guarded API traffic`
      );
      continue;
    }

    assert.match(
      source,
      /guardApiProxyRequest/,
      `Expected ${appName} proxy to use guardApiProxyRequest`
    );
  }
});
