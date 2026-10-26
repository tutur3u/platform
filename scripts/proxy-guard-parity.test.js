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

// Native Start apps prove their guard wiring behaviourally: this test drives
// the real Worker entry with only the shared guard verdict and network faked.
const NATIVE_GUARD_TEST = 'src/native/worker-api-guard.test.ts';

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

test('native Start apps own a behavioural Worker API guard test', () => {
  const nativeApps = getAppsWithNextDependency().filter(isNativeStartApp);

  for (const appName of nativeApps) {
    const appDir = path.join(appsDir, appName);
    const testPath = path.join(appDir, NATIVE_GUARD_TEST);
    assert.ok(
      fs.existsSync(testPath),
      `Expected ${appName} to prove its Worker API guard in ${path.relative(repoRoot, testPath)}`
    );
    const source = fs.readFileSync(testPath, 'utf8');
    // The real Worker entry runs; only the guard verdict and fetch are faked.
    assert.match(source, /import\('\.\.\/\.\.\/cloudflare\/worker'\)/);
    assert.match(source, /vi\.mock\('@tuturuuu\/utils\/api-proxy-guard'/);
    assert.match(source, /vi\.stubGlobal\('fetch'/);
    assert.match(source, /expect\(upstream\)\.not\.toHaveBeenCalled\(\)/);
    assert.match(
      fs.readFileSync(path.join(appDir, 'vitest.config.ts'), 'utf8'),
      /'src\/native\/\*\*\/\*\.test\.\{ts,tsx\}'/,
      `Expected ${appName}'s unit suite to run ${NATIVE_GUARD_TEST}`
    );
  }
});
