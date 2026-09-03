const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  BUILD_INFO_ROUTE,
  loadVercelWorkflowTargets,
  validateBuildInfoCoverage,
} = require('./check-build-info-coverage');

const REPO_ROOT = path.resolve(__dirname, '../..');
const CHECKER_PATH = path.join(__dirname, 'check-build-info-coverage.js');

function createFixture(t) {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'build-info-coverage-')
  );
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));
  return rootDir;
}

function createTargetRoot(rootDir, appPath) {
  fs.mkdirSync(path.join(rootDir, appPath), { recursive: true });
}

function writeBuildInfoRoute(rootDir, appPath, identity) {
  const routePath = path.join(rootDir, appPath, BUILD_INFO_ROUTE);
  fs.mkdirSync(path.dirname(routePath), { recursive: true });
  fs.writeFileSync(
    routePath,
    `import { createBuildInfoHandler } from '@tuturuuu/utils/build-info-route';\n\nexport const GET = createBuildInfoHandler('${identity}');\n`
  );
}

function nextTarget(app, buildInfoApp = app) {
  return {
    app,
    appPath: `apps/${app}`,
    buildInfoApp,
    framework: 'next',
  };
}

test('accepts complete Next coverage and skips route coverage for TanStack Start', (t) => {
  const rootDir = createFixture(t);
  writeBuildInfoRoute(rootDir, 'apps/alpha', 'alpha-info');
  createTargetRoot(rootDir, 'apps/tanstack');

  const errors = validateBuildInfoCoverage({
    rootDir,
    targets: [
      nextTarget('alpha', 'alpha-info'),
      {
        app: 'tanstack',
        appPath: 'apps/tanstack',
        framework: 'tanstack-start',
      },
    ],
  });

  assert.deepEqual(errors, []);
});

test('reports a missing build-info route with its target path', (t) => {
  const rootDir = createFixture(t);
  createTargetRoot(rootDir, 'apps/alpha');

  assert.deepEqual(
    validateBuildInfoCoverage({ rootDir, targets: [nextTarget('alpha')] }),
    [
      '[alpha] Missing build-info route: apps/alpha/src/app/api/build-info/route.ts.',
    ]
  );
});

test('reports a build-info identity mismatch', (t) => {
  const rootDir = createFixture(t);
  writeBuildInfoRoute(rootDir, 'apps/alpha', 'wrong');

  assert.deepEqual(
    validateBuildInfoCoverage({ rootDir, targets: [nextTarget('alpha')] }),
    [
      '[alpha] Build-info route identity mismatch: expected createBuildInfoHandler("alpha") in apps/alpha/src/app/api/build-info/route.ts.',
    ]
  );
});

test('reports a missing target root', (t) => {
  const rootDir = createFixture(t);

  assert.deepEqual(
    validateBuildInfoCoverage({ rootDir, targets: [nextTarget('missing')] }),
    ['[missing] Target root does not exist: apps/missing.']
  );
});

test('sorts multiple diagnostics deterministically', (t) => {
  const rootDir = createFixture(t);
  writeBuildInfoRoute(rootDir, 'apps/zeta', 'wrong');
  createTargetRoot(rootDir, 'apps/alpha');

  const errors = validateBuildInfoCoverage({
    rootDir,
    targets: [nextTarget('zeta'), nextTarget('alpha')],
  });

  assert.deepEqual(errors, [
    '[alpha] Missing build-info route: apps/alpha/src/app/api/build-info/route.ts.',
    '[zeta] Build-info route identity mismatch: expected createBuildInfoHandler("zeta") in apps/zeta/src/app/api/build-info/route.ts.',
  ]);
});

test('rejects missing and unknown framework metadata', (t) => {
  const rootDir = createFixture(t);
  createTargetRoot(rootDir, 'apps/missing-framework');
  createTargetRoot(rootDir, 'apps/unknown-framework');

  const errors = validateBuildInfoCoverage({
    rootDir,
    targets: [
      { app: 'missing-framework', appPath: 'apps/missing-framework' },
      {
        app: 'unknown-framework',
        appPath: 'apps/unknown-framework',
        framework: 'other',
      },
    ],
  });

  assert.deepEqual(errors, [
    '[missing-framework] Invalid framework undefined; expected "next" or "tanstack-start".',
    '[unknown-framework] Invalid framework "other"; expected "next" or "tanstack-start".',
  ]);
});

test('requires buildInfoApp on every Next target', (t) => {
  const rootDir = createFixture(t);
  createTargetRoot(rootDir, 'apps/alpha');

  assert.deepEqual(
    validateBuildInfoCoverage({
      rootDir,
      targets: [{ app: 'alpha', appPath: 'apps/alpha', framework: 'next' }],
    }),
    [
      '[alpha] Missing buildInfoApp; Next targets must declare their build-info response identity.',
    ]
  );
});

test('rejects buildInfoApp on TanStack Start targets', (t) => {
  const rootDir = createFixture(t);
  createTargetRoot(rootDir, 'apps/tanstack');

  assert.deepEqual(
    validateBuildInfoCoverage({
      rootDir,
      targets: [
        {
          app: 'tanstack',
          appPath: 'apps/tanstack',
          buildInfoApp: 'tanstack',
          framework: 'tanstack-start',
        },
      ],
    }),
    [
      '[tanstack] Unexpected buildInfoApp; tanstack-start targets do not use the Next build-info route contract.',
    ]
  );
});

test('the canonical Vercel registry has complete build-info coverage', async () => {
  const targets = await loadVercelWorkflowTargets(
    path.join(REPO_ROOT, 'tuturuuu.ts')
  );

  assert.deepEqual(
    validateBuildInfoCoverage({ rootDir: REPO_ROOT, targets }),
    []
  );
});

test('Apps and Tools routes expose matching no-store build information', () => {
  const script = `
    const results = [];
    for (const app of ['apps', 'tools']) {
      const route = await import(\`./apps/\${app}/src/app/api/build-info/route.ts\`);
      const response = route.GET();
      results.push({
        app,
        body: await response.json(),
        cacheControl: response.headers.get('cache-control'),
        status: response.status,
      });
    }
    console.log(JSON.stringify(results));
  `;
  const result = spawnSync('bun', ['-e', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const responses = JSON.parse(result.stdout);

  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.body.appName, response.app);
    assert.equal(response.cacheControl, 'no-store, max-age=0');
  }
});

test('the CLI fails for a missing fixture route and passes after restoration', (t) => {
  const rootDir = createFixture(t);
  const registryPath = path.join(rootDir, 'registry.mjs');
  const target = nextTarget('alpha');
  createTargetRoot(rootDir, target.appPath);
  fs.writeFileSync(
    registryPath,
    `export const vercelWorkflowTargets = ${JSON.stringify([target])};\n`
  );

  const missingResult = spawnSync(
    process.execPath,
    [CHECKER_PATH, '--root', rootDir, '--registry', registryPath],
    { encoding: 'utf8' }
  );
  assert.equal(missingResult.status, 1);
  assert.match(missingResult.stderr, /Missing build-info route/u);

  writeBuildInfoRoute(rootDir, target.appPath, target.buildInfoApp);
  const restoredResult = spawnSync(
    process.execPath,
    [CHECKER_PATH, '--root', rootDir, '--registry', registryPath],
    { encoding: 'utf8' }
  );
  assert.equal(restoredResult.status, 0);
  assert.match(restoredResult.stdout, /coverage is complete/u);
});
