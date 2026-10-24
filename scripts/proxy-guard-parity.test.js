const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const appsDir = path.join(repoRoot, 'apps');

function getAppsWithNextDependency() {
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

// Native Start apps (e.g. Shortener) keep `next` only for shared Next-shaped
// helpers; they have no App Router tree and do not build with `next build`.
function isNativeStartApp(appName) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(appsDir, appName, 'package.json'), 'utf8')
  );
  return (
    !fs.existsSync(path.join(appsDir, appName, 'src', 'app')) &&
    !/\bnext\s+build\b/.test(packageJson.scripts?.build ?? '')
  );
}

function getNextApps() {
  return getAppsWithNextDependency().filter((app) => !isNativeStartApp(app));
}

function readSources(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readSources(entryPath);
    return /\.[cm]?tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [fs.readFileSync(entryPath, 'utf8')]
      : [];
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

test('native Start apps guard API traffic in their Worker request path', () => {
  const nativeApps = getAppsWithNextDependency().filter(isNativeStartApp);

  for (const appName of nativeApps) {
    const sources = ['src', 'cloudflare'].flatMap((directory) =>
      readSources(path.join(appsDir, appName, directory))
    );
    assert.ok(
      sources.some((source) => /guardApiProxyRequest/.test(source)),
      `Expected ${appName} to guard API traffic with guardApiProxyRequest`
    );
  }
});
