const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkManifestGates,
  countManifestRoutes,
  parseArgs,
  runCutoverGates,
  validateBenchmarkReport,
  validateCloudflareSmokeReport,
  validateE2EReport,
} = require('./tanstack-cutover-gates.js');
const { METRIC_DEFINITIONS } = require('./benchmark-web-setups.js');
const { createE2ECompareReport } = require('./run-web-e2e-docker.js');
const { writeManifest } = require('./tanstack-migration-manifest.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createBenchmarkRoute(routePath, status = 200) {
  return {
    routePath,
    samples: [{ durationMs: 100, ok: status >= 200 && status < 400, status }],
    summary: { failed: status >= 200 && status < 400 ? 0 : 1, p95Ms: 100 },
  };
}

function createValidBenchmarkReport() {
  const benchmarkMetricComparisons = Object.values(METRIC_DEFINITIONS).map(
    ({ metric }) => ({
      metric,
      passed: true,
      threshold: metric.startsWith('api-latency-') ? 0.1 : 0.25,
    })
  );

  return {
    gates: {
      comparisons: [
        {
          metric: 'frontend-route-p95',
          passed: true,
          routePath: '/',
          threshold: 0.25,
        },
        ...benchmarkMetricComparisons,
      ],
      failures: [],
      frontendRouteCoverage: {
        complete: true,
        matchedRoutes: ['/'],
        nextRoutes: ['/'],
        tanstackRoutes: ['/'],
        unmatchedNextRoutes: [],
        unmatchedTanstackRoutes: [],
      },
      passed: true,
    },
    generatedAt: '2026-06-20T00:00:00.000Z',
    profile: 'full',
    setup: 'compare',
    setups: {
      backend: {
        routes: [createBenchmarkRoute('/healthz')],
      },
      next: {
        routes: [createBenchmarkRoute('/')],
      },
      tanstack: {
        routes: [createBenchmarkRoute('/')],
      },
    },
  };
}

function createValidCloudflareSmokeReport() {
  return {
    generatedAt: '2026-06-20T00:00:00.000Z',
    ok: true,
    results: [
      {
        durationMs: 10,
        id: 'backend-health',
        label: 'Rust backend health',
        ok: true,
        status: 200,
        url: 'https://backend.example.workers.dev/healthz',
      },
      {
        durationMs: 10,
        id: 'backend-ready',
        label: 'Rust backend readiness',
        ok: true,
        status: 200,
        url: 'https://backend.example.workers.dev/readyz',
      },
      {
        durationMs: 10,
        id: 'backend-migration-status',
        label: 'Rust migration status',
        ok: true,
        status: 200,
        url: 'https://backend.example.workers.dev/api/migration/status',
      },
      {
        durationMs: 10,
        id: 'tanstack-root',
        label: 'TanStack Start root',
        ok: true,
        status: 200,
        url: 'https://tanstack.example.workers.dev/',
      },
    ],
  };
}

function createCutoverFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tanstack-gates-'));
  const appDir = path.join(rootDir, 'apps', 'web', 'src', 'app');
  const routeFile = path.join(appDir, 'api', 'health', 'route.ts');
  const pageFile = path.join(appDir, '[locale]', 'page.tsx');
  fs.mkdirSync(path.dirname(routeFile), { recursive: true });
  fs.mkdirSync(path.dirname(pageFile), { recursive: true });
  fs.writeFileSync(routeFile, 'export function GET() {}\n');
  fs.writeFileSync(
    pageFile,
    'export default function Page() { return null; }\n'
  );

  const manifestPath = path.join(
    rootDir,
    'apps',
    'tanstack-web',
    'migration',
    'route-manifest.json'
  );
  const overridesPath = path.join(
    rootDir,
    'apps',
    'tanstack-web',
    'migration',
    'route-overrides.json'
  );
  writeJson(overridesPath, {
    routes: {
      'api:/api/health:apps/web/src/app/api/health/route.ts': {
        status: 'migrated',
        targetOwner: 'rust-backend',
      },
      'page:/:locale:apps/web/src/app/[locale]/page.tsx': {
        status: 'migrated',
        targetOwner: 'tanstack-start',
      },
    },
  });
  writeManifest({ appDir, manifestPath, overridesPath, rootDir });

  const benchmarkReportPath = path.join(rootDir, 'benchmark-report.json');
  writeJson(benchmarkReportPath, createValidBenchmarkReport());

  const cloudflareSmokeReportPath = path.join(
    rootDir,
    'cloudflare-smoke-report.json'
  );
  writeJson(cloudflareSmokeReportPath, createValidCloudflareSmokeReport());

  const e2eReportPath = path.join(rootDir, 'e2e-report.json');
  writeJson(e2eReportPath, {
    frontend: 'compare',
    frontends: {
      next: { passRate: 1, status: 'passed', wallMs: 10000 },
      tanstack: { passRate: 1, status: 'passed', wallMs: 11000 },
    },
    generatedAt: '2026-06-20T00:00:00.000Z',
    status: 'passed',
  });

  return {
    appDir,
    benchmarkReportPath,
    cloudflareSmokeReportPath,
    e2eReportPath,
    manifestPath,
    overridesPath,
    rootDir,
  };
}

test('parseArgs accepts cutover evidence paths', () => {
  const args = parseArgs([
    '--manifest',
    'manifest.json',
    '--overrides',
    'overrides.json',
    '--benchmark-report',
    'benchmark.json',
    '--cloudflare-smoke-report',
    'cloudflare-smoke.json',
    '--e2e-report',
    'e2e.json',
    '--output',
    'result.json',
    '--allow-legacy',
    '--skip-benchmark',
    '--skip-cloudflare-smoke',
    '--skip-e2e',
  ]);

  assert.equal(args.requireMigrated, false);
  assert.equal(args.requireBenchmark, false);
  assert.equal(args.requireCloudflareSmoke, false);
  assert.equal(args.requireE2E, false);
  assert.match(args.manifestPath, /manifest\.json$/u);
  assert.match(args.overridesPath, /overrides\.json$/u);
  assert.match(args.benchmarkReportPath, /benchmark\.json$/u);
  assert.match(args.cloudflareSmokeReportPath, /cloudflare-smoke\.json$/u);
  assert.match(args.e2eReportPath, /e2e\.json$/u);
});

test('countManifestRoutes summarizes ownership and status gates', () => {
  assert.deepEqual(
    countManifestRoutes([
      { kind: 'api', status: 'legacy-next', targetOwner: 'rust-backend' },
      { kind: 'page', status: 'migrated', targetOwner: 'tanstack-start' },
      { kind: 'route-handler', status: 'accepted-removal', targetOwner: '' },
    ]),
    {
      acceptedRemoval: 1,
      backendOwned: 1,
      backendRouteArtifacts: 2,
      frontendOwned: 1,
      legacyNext: 1,
      migrated: 1,
      total: 3,
      unknownStatus: 0,
      unmapped: 1,
    }
  );
});

test('runCutoverGates passes with manifest, benchmark, and E2E evidence', () => {
  const fixture = createCutoverFixture();

  try {
    const result = runCutoverGates(fixture);

    assert.equal(result.ok, true);
    assert.equal(result.manifest.counts.total, 2);
    assert.equal(
      result.gates.every((gate) => gate.ok),
      true
    );
  } finally {
    fs.rmSync(fixture.rootDir, { force: true, recursive: true });
  }
});

test('runCutoverGates fails when required E2E, benchmark, or Cloudflare smoke evidence is missing', () => {
  const fixture = createCutoverFixture();

  try {
    const result = runCutoverGates({
      appDir: fixture.appDir,
      manifestPath: fixture.manifestPath,
      overridesPath: fixture.overridesPath,
      rootDir: fixture.rootDir,
    });

    assert.equal(result.ok, false);
    assert.ok(result.gates.some((gate) => gate.id === 'benchmark-compare'));
    assert.ok(result.gates.some((gate) => gate.id === 'docker-e2e-compare'));
    assert.ok(result.gates.some((gate) => gate.id === 'cloudflare-smoke'));
  } finally {
    fs.rmSync(fixture.rootDir, { force: true, recursive: true });
  }
});

test('checkManifestGates keeps method-split legacy siblings blocking cutover', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tanstack-gates-'));
  const appDir = path.join(rootDir, 'apps', 'web', 'src', 'app');
  const routeFile = path.join(
    appDir,
    'api',
    'v1',
    'auth',
    'mobile',
    'password-login',
    'route.ts'
  );
  const manifestPath = path.join(
    rootDir,
    'apps',
    'tanstack-web',
    'migration',
    'route-manifest.json'
  );
  const overridesPath = path.join(
    rootDir,
    'apps',
    'tanstack-web',
    'migration',
    'route-overrides.json'
  );
  const routeId =
    'api:/api/v1/auth/mobile/password-login:apps/web/src/app/api/v1/auth/mobile/password-login/route.ts';

  try {
    fs.mkdirSync(path.dirname(routeFile), { recursive: true });
    fs.writeFileSync(
      routeFile,
      'export function OPTIONS() {}\nexport async function POST() {}\n'
    );
    writeJson(overridesPath, {
      routes: {
        [routeId]: {
          methods: {
            OPTIONS: {
              status: 'migrated',
              targetOwner: 'rust-backend',
            },
          },
        },
      },
    });
    writeManifest({ appDir, manifestPath, overridesPath, rootDir });

    const result = checkManifestGates({
      appDir,
      manifestPath,
      overridesPath,
      requireMigrated: true,
      rootDir,
    });
    const legacyGate = result.gates.find(
      (gate) => gate.id === 'no-legacy-routes'
    );

    assert.equal(result.ok, false);
    assert.equal(legacyGate.ok, false);
    assert.match(
      legacyGate.detail,
      /1 route artifacts still have legacy-next/u
    );
  } finally {
    fs.rmSync(rootDir, { force: true, recursive: true });
  }
});

test('checkManifestGates fails when any route or API is unmapped', () => {
  const fixture = createCutoverFixture();

  try {
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.routes[0].targetOwner = '';
    writeJson(fixture.manifestPath, manifest);

    const result = checkManifestGates(fixture);
    const unmappedGate = result.gates.find(
      (gate) => gate.id === 'no-unmapped-routes'
    );

    assert.equal(result.ok, false);
    assert.equal(unmappedGate.ok, false);
    assert.match(unmappedGate.detail, /1 routes are unmapped/u);
  } finally {
    fs.rmSync(fixture.rootDir, { force: true, recursive: true });
  }
});

test('validateBenchmarkReport requires compare full setup metrics', () => {
  const validation = validateBenchmarkReport({
    gates: {
      failures: ['Backend /healthz had failed samples.'],
      passed: false,
    },
    profile: 'smoke',
    setup: 'backend',
    setups: {},
  });

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /setup must be compare/u);
  assert.match(validation.failures.join('\n'), /profile must be full/u);
  assert.match(validation.failures.join('\n'), /missing next setup/u);
});

test('validateCloudflareSmokeReport requires all Worker readiness probes', () => {
  const report = createValidCloudflareSmokeReport();
  report.results = report.results.filter(
    (result) => result.id !== 'tanstack-root'
  );

  const validation = validateCloudflareSmokeReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /missing tanstack-root/u);
});

test('validateCloudflareSmokeReport rejects failed Worker smoke probes', () => {
  const report = createValidCloudflareSmokeReport();
  report.ok = false;
  const migrationProbe = report.results.find(
    (result) => result.id === 'backend-migration-status'
  );
  migrationProbe.ok = false;
  migrationProbe.status = 401;
  migrationProbe.detail = 'HTTP 401';

  const validation = validateCloudflareSmokeReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /did not pass/u);
  assert.match(validation.failures.join('\n'), /backend-migration-status/u);
  assert.match(validation.failures.join('\n'), /status 401/u);
});

test('validateBenchmarkReport rejects frontend 404 benchmark samples', () => {
  const report = createValidBenchmarkReport();
  report.setups.next.routes = [createBenchmarkRoute('/', 404)];
  report.gates.passed = true;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /next \/ had failed samples/u);
  assert.match(
    validation.failures.join('\n'),
    /next \/ returned benchmark status 404/u
  );
});

test('validateBenchmarkReport requires frontend comparison evidence', () => {
  const report = createValidBenchmarkReport();
  report.gates.comparisons = report.gates.comparisons.filter(
    (comparison) => comparison.metric !== 'frontend-route-p95'
  );

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /missing frontend-route-p95 compare evidence/u
  );
});

test('validateBenchmarkReport requires the full cutover benchmark metric contract', () => {
  const report = createValidBenchmarkReport();
  report.gates.comparisons = report.gates.comparisons.filter(
    (comparison) =>
      ![
        'api-latency-p50',
        'api-latency-p95',
        'api-latency-p99',
        'dev-ready-time',
        'docker-build-time',
        'e2e-pass-rate',
        'e2e-wall-time',
        'first-route-cold-time',
        'image-size',
        'js-output-size',
        'production-cpu-baseline',
        'production-rss-baseline',
        'warm-navigation-time',
      ].includes(comparison.metric)
  );

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /api-latency-p50/u);
  assert.match(validation.failures.join('\n'), /api-latency-p95/u);
  assert.match(validation.failures.join('\n'), /api-latency-p99/u);
  assert.match(validation.failures.join('\n'), /dev-ready-time/u);
  assert.match(validation.failures.join('\n'), /docker-build-time/u);
  assert.match(validation.failures.join('\n'), /e2e-pass-rate/u);
  assert.match(validation.failures.join('\n'), /e2e-wall-time/u);
  assert.match(validation.failures.join('\n'), /first-route-cold-time/u);
  assert.match(validation.failures.join('\n'), /image-size/u);
  assert.match(validation.failures.join('\n'), /js-output-size/u);
  assert.match(validation.failures.join('\n'), /production-cpu-baseline/u);
  assert.match(validation.failures.join('\n'), /production-rss-baseline/u);
  assert.match(validation.failures.join('\n'), /warm-navigation-time/u);
});

test('validateBenchmarkReport rejects API p95 regressions over 10 percent without accepted notes', () => {
  const report = createValidBenchmarkReport();
  const comparison = report.gates.comparisons.find(
    (item) => item.metric === 'api-latency-p95'
  );
  comparison.passed = false;
  comparison.ratio = 0.12;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /api-latency-p95/u);
});

test('validateBenchmarkReport allows accepted frontend startup/RSS/cold-navigation regressions', () => {
  const report = createValidBenchmarkReport();
  for (const metric of [
    'dev-ready-time',
    'first-route-cold-time',
    'production-rss-baseline',
  ]) {
    const comparison = report.gates.comparisons.find(
      (item) => item.metric === metric
    );
    comparison.passed = false;
    comparison.ratio = 0.3;
    comparison.acceptedNote = `Accepted ${metric} regression during migration.`;
  }

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, true);
});

test('validateBenchmarkReport requires frontend route coverage evidence', () => {
  const report = createValidBenchmarkReport();
  delete report.gates.frontendRouteCoverage;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /missing frontend route coverage/u
  );
});

test('validateBenchmarkReport rejects incomplete frontend route coverage', () => {
  const report = createValidBenchmarkReport();
  report.gates.frontendRouteCoverage = {
    complete: false,
    matchedRoutes: ['/'],
    nextRoutes: ['/', '/login'],
    tanstackRoutes: ['/'],
    unmatchedNextRoutes: ['/login'],
    unmatchedTanstackRoutes: [],
  };

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /incomplete frontend route coverage/u
  );
  assert.match(
    validation.failures.join('\n'),
    /missing from TanStack: \/login/u
  );
});

test('validateE2EReport requires both frontend results', () => {
  const validation = validateE2EReport({
    frontend: 'compare',
    frontends: {
      next: { passRate: 1, status: 'passed', wallMs: 10000 },
    },
    status: 'passed',
  });

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /missing tanstack/u);
});

test('validateE2EReport accepts Docker compare report output', () => {
  const report = createE2ECompareReport(
    {
      next: { durationMs: 10000, passed: true, status: 'passed' },
      tanstack: { durationMs: 11000, passed: true, status: 'passed' },
    },
    new Date('2026-06-20T00:00:00.000Z')
  );

  const validation = validateE2EReport(report);

  assert.equal(validation.ok, true);
});

test('validateE2EReport rejects pass-rate and wall-time regressions without accepted notes', () => {
  const validation = validateE2EReport({
    frontend: 'compare',
    frontends: {
      next: { passRate: 1, status: 'passed', wallMs: 10000 },
      tanstack: { passRate: 0.9, status: 'passed', wallMs: 13000 },
    },
    status: 'passed',
  });

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /pass rate regressed/u);
  assert.match(validation.failures.join('\n'), /wall time regressed/u);
});

test('validateE2EReport allows accepted wall-time regressions', () => {
  const validation = validateE2EReport({
    acceptedNotes: {
      wallMs: 'Accepted while container startup is being tuned.',
    },
    frontend: 'compare',
    frontends: {
      next: { passRate: 1, status: 'passed', wallMs: 10000 },
      tanstack: { passRate: 1, status: 'passed', wallMs: 13000 },
    },
    status: 'passed',
  });

  assert.equal(validation.ok, true);
});
