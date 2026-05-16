const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const portlessConfigPath = path.join(repoRoot, 'portless.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAppPackageDirs() {
  return fs
    .readdirSync(path.join(repoRoot, 'apps'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(repoRoot, 'apps', entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')));
}

function getPortlessAppPackages() {
  return getAppPackageDirs()
    .map((dir) => {
      const pkg = readJson(path.join(dir, 'package.json'));
      return {
        pkg,
        relPath: path.relative(repoRoot, dir).replace(/\\/g, '/'),
      };
    })
    .filter(({ pkg }) => typeof pkg.scripts?.['dev:app'] === 'string');
}

test('portless config covers every app package with a dev:app script', () => {
  const config = readJson(portlessConfigPath);
  const configuredPaths = Object.keys(config.apps).sort();
  const appPackagePaths = getPortlessAppPackages()
    .map(({ relPath }) => relPath)
    .sort();

  assert.deepEqual(configuredPaths, appPackagePaths);
});

test('app package portless entries mirror the root portless app map', () => {
  const config = readJson(portlessConfigPath);
  const names = new Set();

  for (const { pkg, relPath } of getPortlessAppPackages()) {
    const appConfig = config.apps[relPath];

    assert.equal(
      pkg.scripts.dev,
      'portless',
      `${relPath} should route its dev script through portless`
    );
    assert.deepEqual(
      pkg.portless,
      appConfig,
      `${relPath} package.json portless config should mirror portless.json`
    );
    assert.equal(
      appConfig.script,
      'dev:app',
      `${relPath} should run the real app through dev:app`
    );
    assert.match(
      pkg.scripts['dev:app'],
      /scripts\/portless-dev-banner\.js/u,
      `${relPath} dev:app should print the Portless URL banner`
    );
    assert.match(
      appConfig.name,
      /(^tuturuuu$|\.tuturuuu$)/u,
      `${relPath} should use the Tuturuuu local domain namespace`
    );
    assert.equal(
      names.has(appConfig.name),
      false,
      `${appConfig.name} should be unique`
    );
    names.add(appConfig.name);
  }
});

test('portless keeps the canonical Tuturuuu app hostnames stable', () => {
  const config = readJson(portlessConfigPath);

  assert.equal(config.apps['apps/web']?.name, 'tuturuuu');
  assert.equal(config.apps['apps/tasks']?.name, 'tasks.tuturuuu');
  assert.equal(
    config.apps['apps/hive-realtime']?.name,
    'realtime.hive.tuturuuu'
  );
});

test('root setup runs Portless setup before build tasks', () => {
  const pkg = readJson(path.join(repoRoot, 'package.json'));

  assert.equal(pkg.scripts['portless:setup'], 'node scripts/setup-portless.js');
  assert.equal(
    pkg.scripts['portless:check'],
    'node scripts/setup-portless.js --check'
  );
  assert.match(
    pkg.scripts.setup,
    /^bun i && bun portless:setup && bun run build/u
  );
});

test('root education dev script starts Learn, Teach, and Web together', () => {
  const pkg = readJson(path.join(repoRoot, 'package.json'));
  const devEduScript = pkg.scripts['dev:edu'];

  assert.equal(typeof devEduScript, 'string');
  assert.match(devEduScript, /^turbo run dev /u);
  assert.match(devEduScript, /-F @tuturuuu\/learn\b/u);
  assert.match(devEduScript, /-F @tuturuuu\/teach\b/u);
  assert.match(devEduScript, /-F @tuturuuu\/web\b/u);
});
