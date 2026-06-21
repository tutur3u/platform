const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
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

function createBenchmarkRoute(
  routePath,
  status = 200,
  origin = 'https://next.example.com'
) {
  const url = new URL(routePath, origin).toString();

  return {
    routePath,
    samples: [
      {
        durationMs: 100,
        ok: status >= 200 && status < 400,
        status,
        url,
      },
    ],
    summary: { failed: status >= 200 && status < 400 ? 0 : 1, p95Ms: 100 },
    url,
  };
}

function createValidBenchmarkReport(generatedAt = new Date().toISOString()) {
  const origins = {
    backend: 'https://backend.example.com',
    next: 'https://next.example.com',
    tanstack: 'https://tanstack.example.com',
  };
  const benchmarkMetricComparisons = Object.values(METRIC_DEFINITIONS).map(
    ({ metric, thresholdType }) => ({
      baselineSetup: 'next',
      baselineValue: 100,
      candidateSetup: thresholdType === 'api' ? 'backend' : 'tanstack',
      candidateValue: 100,
      metric,
      passed: true,
      ratio: 0,
      threshold:
        thresholdType === 'api' ? 0.1 : thresholdType === 'strict' ? 0 : 0.25,
    })
  );

  return {
    gates: {
      comparisons: [
        {
          baselineP95Ms: 100,
          candidateP95Ms: 100,
          metric: 'frontend-route-p95',
          passed: true,
          ratio: 0,
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
    generatedAt,
    profile: 'full',
    setup: 'compare',
    setups: {
      backend: {
        origin: origins.backend,
        routes: [createBenchmarkRoute('/healthz', 200, origins.backend)],
      },
      next: {
        origin: origins.next,
        routes: [createBenchmarkRoute('/', 200, origins.next)],
      },
      tanstack: {
        origin: origins.tanstack,
        routes: [createBenchmarkRoute('/', 200, origins.tanstack)],
      },
    },
  };
}

function createValidCloudflareSmokeReport(
  generatedAt = new Date().toISOString()
) {
  const backendOrigin = 'https://backend.example.workers.dev';
  const tanstackOrigin = 'https://tanstack.example.workers.dev';

  return {
    generatedAt,
    ok: true,
    provenance: {
      backendOrigin,
      probeIds: [
        'backend-health',
        'backend-ready',
        'backend-migration-status',
        'backend-migration-status-missing-token',
        'backend-migration-status-invalid-token',
        'tanstack-root',
      ],
      reporter: 'scripts/smoke-cloudflare-workers.js',
      tanstackOrigin,
      timeoutMs: 10_000,
    },
    results: [
      {
        durationMs: 10,
        id: 'backend-health',
        label: 'Rust backend health',
        ok: true,
        status: 200,
        url: `${backendOrigin}/healthz`,
      },
      {
        durationMs: 10,
        id: 'backend-ready',
        label: 'Rust backend readiness',
        ok: true,
        status: 200,
        url: `${backendOrigin}/readyz`,
      },
      {
        durationMs: 10,
        id: 'backend-migration-status',
        label: 'Rust migration status',
        ok: true,
        status: 200,
        url: `${backendOrigin}/api/migration/status`,
      },
      {
        durationMs: 10,
        expectedStatus: 401,
        id: 'backend-migration-status-missing-token',
        label: 'Rust migration status rejects missing token',
        ok: true,
        status: 401,
        url: `${backendOrigin}/api/migration/status`,
      },
      {
        durationMs: 10,
        expectedStatus: 401,
        id: 'backend-migration-status-invalid-token',
        label: 'Rust migration status rejects invalid token',
        ok: true,
        status: 401,
        url: `${backendOrigin}/api/migration/status`,
      },
      {
        durationMs: 10,
        id: 'tanstack-root',
        label: 'TanStack Start root',
        ok: true,
        status: 200,
        url: `${tanstackOrigin}/`,
      },
    ],
  };
}

function createValidE2EReport(generatedAt = new Date().toISOString()) {
  const origins = {
    next: 'https://next.example.com',
    tanstack: 'https://tanstack.example.com',
  };

  return {
    frontend: 'compare',
    frontends: {
      next: {
        executedCount: 10,
        failedCount: 0,
        origin: origins.next,
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 10000,
      },
      tanstack: {
        executedCount: 10,
        failedCount: 0,
        origin: origins.tanstack,
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 11000,
      },
    },
    generatedAt,
    origins,
    status: 'passed',
  };
}

function createCutoverFixture(generatedAt = new Date().toISOString()) {
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
        note: 'Fixture Rust health endpoint ownership evidence.',
        status: 'migrated',
        targetOwner: 'rust-backend',
      },
      'page:/:locale:apps/web/src/app/[locale]/page.tsx': {
        note: 'Fixture TanStack landing page ownership evidence.',
        status: 'migrated',
        targetOwner: 'tanstack-start',
      },
    },
  });
  writeManifest({ appDir, manifestPath, overridesPath, rootDir });

  const benchmarkReportPath = path.join(rootDir, 'benchmark-report.json');
  writeJson(benchmarkReportPath, createValidBenchmarkReport(generatedAt));

  const cloudflareSmokeReportPath = path.join(
    rootDir,
    'cloudflare-smoke-report.json'
  );
  writeJson(
    cloudflareSmokeReportPath,
    createValidCloudflareSmokeReport(generatedAt)
  );

  const e2eReportPath = path.join(rootDir, 'e2e-report.json');
  writeJson(e2eReportPath, createValidE2EReport(generatedAt));

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
    '--evidence-max-age-ms',
    '60000',
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
  assert.equal(args.evidenceMaxAgeMs, 60_000);
  assert.match(args.manifestPath, /manifest\.json$/u);
  assert.match(args.overridesPath, /overrides\.json$/u);
  assert.match(args.benchmarkReportPath, /benchmark\.json$/u);
  assert.match(args.cloudflareSmokeReportPath, /cloudflare-smoke\.json$/u);
  assert.match(args.e2eReportPath, /e2e\.json$/u);
  assert.match(args.outputPath, /result\.json$/u);
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

test('CLI writes cutover gate output JSON for review handoff', () => {
  const fixture = createCutoverFixture();
  const outputPath = path.join(fixture.rootDir, 'cutover-gates.json');

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'tanstack-cutover-gates.js'),
        '--allow-legacy',
        '--benchmark-report',
        fixture.benchmarkReportPath,
        '--cloudflare-smoke-report',
        fixture.cloudflareSmokeReportPath,
        '--e2e-report',
        fixture.e2eReportPath,
        '--output',
        outputPath,
      ],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /TanStack\/Rust cutover gates passed/u);
    assert.equal(fs.existsSync(outputPath), true);

    const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(output.ok, true);
    assert.ok(output.manifest.counts.total > 0);
    assert.ok(output.benchmark);
    assert.ok(output.e2e);
    assert.ok(output.cloudflareSmoke);
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

test('runCutoverGates rejects stale benchmark, E2E, and Cloudflare smoke evidence', () => {
  const fixture = createCutoverFixture('2026-06-20T00:00:00.000Z');

  try {
    const result = runCutoverGates({
      ...fixture,
      evidenceMaxAgeMs: 60 * 60 * 1000,
      evidenceNowMs: Date.parse('2026-06-20T03:00:00.000Z'),
    });
    const benchmarkGate = result.gates.find(
      (gate) => gate.id === 'benchmark-compare'
    );
    const e2eGate = result.gates.find(
      (gate) => gate.id === 'docker-e2e-compare'
    );
    const cloudflareGate = result.gates.find(
      (gate) => gate.id === 'cloudflare-smoke'
    );

    assert.equal(result.ok, false);
    assert.equal(benchmarkGate.ok, false);
    assert.equal(e2eGate.ok, false);
    assert.equal(cloudflareGate.ok, false);
    assert.match(benchmarkGate.detail, /Benchmark report is stale/u);
    assert.match(e2eGate.detail, /Docker E2E compare report is stale/u);
    assert.match(cloudflareGate.detail, /Cloudflare smoke report is stale/u);
  } finally {
    fs.rmSync(fixture.rootDir, { force: true, recursive: true });
  }
});

test('runCutoverGates rejects diagnostic skip flags when terminal cutover is required', () => {
  const fixture = createCutoverFixture();

  try {
    const result = runCutoverGates({
      appDir: fixture.appDir,
      manifestPath: fixture.manifestPath,
      overridesPath: fixture.overridesPath,
      requireBenchmark: false,
      requireCloudflareSmoke: false,
      requireE2E: false,
      requireMigrated: true,
      rootDir: fixture.rootDir,
    });
    const skipGate = result.gates.find(
      (gate) => gate.id === 'diagnostic-evidence-skips'
    );

    assert.equal(result.ok, false);
    assert.equal(skipGate.ok, false);
    assert.match(skipGate.detail, /not allowed for terminal cutover/u);
    assert.match(skipGate.detail, /--skip-benchmark/u);
    assert.match(skipGate.detail, /--skip-e2e/u);
    assert.match(skipGate.detail, /--skip-cloudflare-smoke/u);
  } finally {
    fs.rmSync(fixture.rootDir, { force: true, recursive: true });
  }
});

test('runCutoverGates allows diagnostic skip flags with allow-legacy mode', () => {
  const fixture = createCutoverFixture();

  try {
    const result = runCutoverGates({
      appDir: fixture.appDir,
      manifestPath: fixture.manifestPath,
      overridesPath: fixture.overridesPath,
      requireBenchmark: false,
      requireCloudflareSmoke: false,
      requireE2E: false,
      requireMigrated: false,
      rootDir: fixture.rootDir,
    });
    const skipGate = result.gates.find(
      (gate) => gate.id === 'diagnostic-evidence-skips'
    );

    assert.equal(result.ok, true);
    assert.equal(skipGate.ok, true);
    assert.match(skipGate.detail, /allowed with --allow-legacy/u);
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
              note: 'Fixture Rust preflight ownership evidence.',
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

test('validateCloudflareSmokeReport rejects negative auth probes that unexpectedly succeed', () => {
  const report = createValidCloudflareSmokeReport();
  const missingTokenProbe = report.results.find(
    (result) => result.id === 'backend-migration-status-missing-token'
  );
  missingTokenProbe.status = 200;

  const validation = validateCloudflareSmokeReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /backend-migration-status-missing-token/u
  );
  assert.match(validation.failures.join('\n'), /expected 401/u);
});

test('validateCloudflareSmokeReport requires smoke provenance', () => {
  const report = createValidCloudflareSmokeReport();
  delete report.provenance;

  const validation = validateCloudflareSmokeReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /must be generated by/u);
  assert.match(validation.failures.join('\n'), /missing backendOrigin/u);
  assert.match(validation.failures.join('\n'), /missing tanstackOrigin/u);
});

test('validateCloudflareSmokeReport rejects probe URLs from the wrong origin', () => {
  const report = createValidCloudflareSmokeReport();
  const tanstackRoot = report.results.find(
    (result) => result.id === 'tanstack-root'
  );
  tanstackRoot.url = 'https://backend.example.workers.dev/';

  const validation = validateCloudflareSmokeReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /tanstack-root smoke probe origin https:\/\/backend\.example\.workers\.dev does not match Cloudflare smoke origin https:\/\/tanstack\.example\.workers\.dev/u
  );
});

test('validateBenchmarkReport rejects frontend 404 benchmark samples', () => {
  const report = createValidBenchmarkReport();
  report.setups.next.routes = [
    createBenchmarkRoute('/', 404, report.setups.next.origin),
  ];
  report.gates.passed = true;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /next \/ had failed samples/u);
  assert.match(
    validation.failures.join('\n'),
    /next \/ returned benchmark status 404/u
  );
});

test('validateBenchmarkReport requires distinct frontend origin evidence', () => {
  const missing = createValidBenchmarkReport();
  delete missing.setups.next.origin;

  const missingValidation = validateBenchmarkReport(missing);

  assert.equal(missingValidation.ok, false);
  assert.match(
    missingValidation.failures.join('\n'),
    /next is missing benchmark origin evidence/u
  );

  const sameOrigin = createValidBenchmarkReport();
  sameOrigin.setups.tanstack.origin = sameOrigin.setups.next.origin;

  const sameOriginValidation = validateBenchmarkReport(sameOrigin);

  assert.equal(sameOriginValidation.ok, false);
  assert.match(
    sameOriginValidation.failures.join('\n'),
    /distinct Next and TanStack origins/u
  );
});

test('validateBenchmarkReport rejects route and sample URLs that do not match setup origins', () => {
  const report = createValidBenchmarkReport();
  report.setups.next.routes[0].url = 'https://wrong.example.com/';
  report.setups.tanstack.routes[0].samples[0].url =
    'https://wrong.example.com/';

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(
    validation.failures.join('\n'),
    /next \/ route origin https:\/\/wrong\.example\.com does not match setup origin https:\/\/next\.example\.com/u
  );
  assert.match(
    validation.failures.join('\n'),
    /tanstack \/ sample 1 origin https:\/\/wrong\.example\.com does not match setup origin https:\/\/tanstack\.example\.com/u
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

test('validateBenchmarkReport rejects required comparisons without numeric evidence', () => {
  const report = createValidBenchmarkReport();
  const comparison = report.gates.comparisons.find(
    (item) => item.metric === 'dev-ready-time'
  );
  delete comparison.baselineValue;
  delete comparison.ratio;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /dev-ready-time/u);
  assert.match(validation.failures.join('\n'), /numeric ratio evidence/u);
  assert.match(validation.failures.join('\n'), /baseline value evidence/u);
});

test('validateBenchmarkReport rejects frontend route p95 comparisons without route values', () => {
  const report = createValidBenchmarkReport();
  const comparison = report.gates.comparisons.find(
    (item) => item.metric === 'frontend-route-p95'
  );
  delete comparison.routePath;
  delete comparison.candidateP95Ms;

  const validation = validateBenchmarkReport(report);

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /route path evidence/u);
  assert.match(validation.failures.join('\n'), /candidate p95 evidence/u);
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
      next: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://next.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 10000,
      },
    },
    origins: {
      next: 'https://next.example.com',
    },
    status: 'passed',
  });

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /missing tanstack/u);
});

test('validateE2EReport accepts Docker compare report output', () => {
  const report = createE2ECompareReport(
    {
      next: {
        durationMs: 10000,
        executedCount: 10,
        failedCount: 0,
        origin: 'https://next.example.com',
        passed: true,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
      },
      tanstack: {
        durationMs: 11000,
        executedCount: 10,
        failedCount: 0,
        origin: 'https://tanstack.example.com',
        passed: true,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
      },
    },
    new Date('2026-06-20T00:00:00.000Z')
  );

  const validation = validateE2EReport(report);

  assert.equal(validation.ok, true);
});

test('validateE2EReport requires distinct frontend origin evidence', () => {
  const missing = createValidE2EReport();
  delete missing.frontends.next.origin;
  delete missing.origins.next;

  const missingValidation = validateE2EReport(missing);

  assert.equal(missingValidation.ok, false);
  assert.match(
    missingValidation.failures.join('\n'),
    /next is missing E2E origin evidence/u
  );

  const sameOrigin = createValidE2EReport();
  sameOrigin.frontends.tanstack.origin = sameOrigin.frontends.next.origin;
  sameOrigin.origins.tanstack = sameOrigin.origins.next;

  const sameOriginValidation = validateE2EReport(sameOrigin);

  assert.equal(sameOriginValidation.ok, false);
  assert.match(
    sameOriginValidation.failures.join('\n'),
    /distinct Next and TanStack origins/u
  );

  const credentialed = createValidE2EReport();
  credentialed.frontends.next.origin = 'https://user:pass@next.example.com';

  const credentialedValidation = validateE2EReport(credentialed);

  assert.equal(credentialedValidation.ok, false);
  assert.match(
    credentialedValidation.failures.join('\n'),
    /next E2E origin must not include credentials/u
  );
});

test('validateE2EReport requires nonzero Playwright execution evidence', () => {
  const missing = createValidE2EReport();
  delete missing.frontends.next.testCount;
  delete missing.frontends.next.executedCount;

  const missingValidation = validateE2EReport(missing);

  assert.equal(missingValidation.ok, false);
  assert.match(
    missingValidation.failures.join('\n'),
    /next E2E report is missing Playwright test execution evidence/u
  );

  const zero = createValidE2EReport();
  zero.frontends.tanstack.testCount = 0;
  zero.frontends.tanstack.executedCount = 0;

  const zeroValidation = validateE2EReport(zero);

  assert.equal(zeroValidation.ok, false);
  assert.match(
    zeroValidation.failures.join('\n'),
    /tanstack E2E report has zero executed Playwright tests/u
  );
});

test('validateE2EReport requires explicit compare frontend mode', () => {
  const validation = validateE2EReport({
    frontends: {
      next: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://next.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 10000,
      },
      tanstack: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://tanstack.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 11000,
      },
    },
    origins: {
      next: 'https://next.example.com',
      tanstack: 'https://tanstack.example.com',
    },
    status: 'passed',
  });

  assert.equal(validation.ok, false);
  assert.match(validation.failures.join('\n'), /frontend compare mode/u);
});

test('validateE2EReport rejects pass-rate and wall-time regressions without accepted notes', () => {
  const validation = validateE2EReport({
    frontend: 'compare',
    frontends: {
      next: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://next.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 10000,
      },
      tanstack: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://tanstack.example.com',
        passRate: 0.9,
        passedCount: 9,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 13000,
      },
    },
    origins: {
      next: 'https://next.example.com',
      tanstack: 'https://tanstack.example.com',
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
      next: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://next.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 10000,
      },
      tanstack: {
        executedCount: 10,
        failedCount: 0,
        origin: 'https://tanstack.example.com',
        passRate: 1,
        passedCount: 10,
        skippedCount: 0,
        status: 'passed',
        testCount: 10,
        wallMs: 13000,
      },
    },
    origins: {
      next: 'https://next.example.com',
      tanstack: 'https://tanstack.example.com',
    },
    status: 'passed',
  });

  assert.equal(validation.ok, true);
});
