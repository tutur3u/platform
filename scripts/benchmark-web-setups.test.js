const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareSetupMetrics,
  getRouteHeaders,
  normalizeEvidenceMetrics,
  parseArgs,
  percentile,
  runBenchmark,
  summarizeFrontendRouteCoverage,
  summarizeDurations,
  timeFetch,
  writeReport,
} = require('./benchmark-web-setups.js');

test('parseArgs accepts compare benchmark options', () => {
  const args = parseArgs([
    '--setup',
    'compare',
    '--profile',
    'full',
    '--samples',
    '5',
    '--next-origin',
    'http://localhost:7803',
    '--tanstack-origin',
    'http://localhost:7824',
    '--backend-origin',
    'http://localhost:7820',
    '--evidence',
    'tmp/benchmark-evidence.json',
    '--require-all',
  ]);

  assert.equal(args.setup, 'compare');
  assert.equal(args.profile, 'full');
  assert.equal(args.samples, 5);
  assert.equal(args.origins.next, 'http://localhost:7803');
  assert.equal(args.origins.tanstack, 'http://localhost:7824');
  assert.match(args.evidencePath, /benchmark-evidence\.json$/u);
  assert.equal(args.requireAll, true);
});

test('parseArgs rejects compare benchmark origins that normalize to the same URL origin', () => {
  assert.throws(
    () =>
      parseArgs([
        '--setup',
        'compare',
        '--next-origin',
        'http://localhost:7803/next',
        '--tanstack-origin',
        'http://localhost:7803/tanstack',
      ]),
    /distinct Next and TanStack origins/u
  );

  assert.throws(
    () =>
      parseArgs([
        '--setup',
        'compare',
        '--next-origin',
        'http://user:pass@localhost:7803',
        '--tanstack-origin',
        'http://localhost:7824',
      ]),
    /must not include credentials/u
  );
});

test('parseArgs reads the backend benchmark token from env without requiring it', () => {
  const args = parseArgs([], {
    BACKEND_INTERNAL_TOKEN: 'server-token',
  });

  assert.equal(args.backendToken, 'server-token');
});

test('timeFetch treats 4xx responses as failed samples', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('unauthorized', { status: 401 });

  try {
    const sample = await timeFetch('http://backend.local/api/migration/status');

    assert.equal(sample.ok, false);
    assert.equal(sample.status, 401);
  } finally {
    global.fetch = originalFetch;
  }
});

test('getRouteHeaders attaches backend tokens only to protected migration probes', () => {
  assert.deepEqual(
    getRouteHeaders({
      backendToken: 'server-token',
      routePath: '/api/migration/status',
      setup: 'backend',
    }),
    {
      authorization: 'Bearer server-token',
    }
  );
  assert.equal(
    getRouteHeaders({
      backendToken: 'server-token',
      routePath: '/healthz',
      setup: 'backend',
    }),
    undefined
  );
  assert.equal(
    getRouteHeaders({
      backendToken: 'server-token',
      routePath: '/',
      setup: 'tanstack',
    }),
    undefined
  );
});

test('runBenchmark sends backend auth to protected migration samples', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ init, url });
    return new Response('ok', {
      status: 200,
    });
  };

  try {
    const report = await runBenchmark({
      apiThreshold: 0.1,
      backendToken: 'server-token',
      frontendThreshold: 0.25,
      origins: {
        backend: 'http://backend.local',
        next: 'http://next.local',
        tanstack: 'http://tanstack.local',
      },
      profile: 'smoke',
      requireAll: false,
      samples: 1,
      setup: 'backend',
    });

    assert.equal(report.gates.passed, true);
    const migrationCall = calls.find(({ url }) =>
      url.endsWith('/api/migration/status')
    );
    assert.equal(
      new Headers(migrationCall.init.headers).get('authorization'),
      'Bearer server-token'
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('percentile and summarizeDurations report cold, warm, p95, and p99 values', () => {
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.deepEqual(
    summarizeDurations([
      { durationMs: 10, ok: true },
      { durationMs: 20, ok: true },
      { durationMs: 30, ok: true },
      { durationMs: 999, ok: false },
    ]),
    {
      coldMs: 10,
      count: 4,
      failed: 1,
      maxMs: 30,
      p50Ms: 20,
      p95Ms: 30,
      p99Ms: 30,
      warmP50Ms: 20,
      warmP95Ms: 30,
      warmP99Ms: 30,
    }
  );
});

test('compareSetupMetrics fails frontend p95 regressions over threshold', () => {
  const gates = compareSetupMetrics({
    apiThreshold: 0.1,
    frontendThreshold: 0.25,
    setups: {
      next: {
        routes: [{ routePath: '/', summary: { p95Ms: 100 } }],
      },
      tanstack: {
        routes: [{ routePath: '/', summary: { p95Ms: 140 } }],
      },
    },
  });

  assert.equal(gates.passed, false);
  assert.match(gates.failures[0], /regressed/u);
});

test('normalizeEvidenceMetrics captures requested compare metrics when available', () => {
  assert.deepEqual(
    normalizeEvidenceMetrics({
      metrics: {
        backend: {
          apiLatencyP50Ms: 80,
          apiLatencyP95Ms: '120',
          apiLatencyP99Ms: 180,
        },
        next: {
          apiLatencyP95Ms: 100,
          devReadyMs: 1000,
          dockerBuildMs: 60_000,
          e2ePassRate: 1,
          e2eWallMs: 30_000,
          firstRouteColdMs: 400,
          imageSizeBytes: 100,
          jsOutputBytes: 200,
          productionCpuPercent: 10,
          productionRssBytes: 1000,
          warmNavigationMs: 50,
        },
        tanstack: {
          devReadyMs: 900,
          firstRouteColdMs: 350,
          productionRssBytes: 900,
        },
      },
    }),
    {
      backend: {
        apiLatencyP50Ms: 80,
        apiLatencyP95Ms: 120,
        apiLatencyP99Ms: 180,
      },
      next: {
        apiLatencyP95Ms: 100,
        devReadyMs: 1000,
        dockerBuildMs: 60000,
        e2ePassRate: 1,
        e2eWallMs: 30000,
        firstRouteColdMs: 400,
        imageSizeBytes: 100,
        jsOutputBytes: 200,
        productionCpuPercent: 10,
        productionRssBytes: 1000,
        warmNavigationMs: 50,
      },
      tanstack: {
        devReadyMs: 900,
        firstRouteColdMs: 350,
        productionRssBytes: 900,
      },
    }
  );
});

test('compareSetupMetrics gates API p95 and frontend runtime evidence', () => {
  const gates = compareSetupMetrics({
    apiThreshold: 0.1,
    frontendThreshold: 0.25,
    metrics: {
      backend: { apiLatencyP95Ms: 112 },
      next: {
        apiLatencyP95Ms: 100,
        devReadyMs: 1000,
        firstRouteColdMs: 100,
        productionRssBytes: 1000,
      },
      tanstack: {
        devReadyMs: 1300,
        firstRouteColdMs: 120,
        productionRssBytes: 1200,
      },
    },
    setups: {
      next: { routes: [{ routePath: '/', summary: { p95Ms: 100 } }] },
      tanstack: { routes: [{ routePath: '/', summary: { p95Ms: 100 } }] },
    },
  });

  assert.equal(gates.passed, false);
  assert.ok(
    gates.comparisons.some(
      (comparison) => comparison.metric === 'api-latency-p95'
    )
  );
  assert.match(gates.failures.join('\n'), /api-latency-p95/u);
  assert.match(gates.failures.join('\n'), /dev-ready-time/u);
});

test('compareSetupMetrics allows accepted metric regressions with notes', () => {
  const gates = compareSetupMetrics({
    acceptedRegressions: [
      {
        metric: 'dev-ready-time',
        note: 'Accepted while Rust dev cache warmup is being tuned.',
      },
    ],
    apiThreshold: 0.1,
    frontendThreshold: 0.25,
    metrics: {
      next: { devReadyMs: 1000 },
      tanstack: { devReadyMs: 1400 },
    },
    setups: {},
  });

  assert.equal(gates.passed, true);
  assert.equal(
    gates.comparisons.find(
      (comparison) => comparison.metric === 'dev-ready-time'
    ).acceptedNote,
    'Accepted while Rust dev cache warmup is being tuned.'
  );
});

test('summarizeFrontendRouteCoverage reports unmatched frontend routes', () => {
  const coverage = summarizeFrontendRouteCoverage(
    {
      routes: [
        { routePath: '/' },
        { routePath: '/login' },
        { routePath: '/personal' },
      ],
    },
    {
      routes: [{ routePath: '/' }, { routePath: '/personal' }],
    }
  );

  assert.deepEqual(coverage, {
    complete: false,
    matchedRoutes: ['/', '/personal'],
    nextRoutes: ['/', '/login', '/personal'],
    tanstackRoutes: ['/', '/personal'],
    unmatchedNextRoutes: ['/login'],
    unmatchedTanstackRoutes: [],
  });
});

test('compareSetupMetrics includes route coverage with matched comparisons', () => {
  const gates = compareSetupMetrics({
    apiThreshold: 0.1,
    frontendThreshold: 0.25,
    setups: {
      next: {
        routes: [
          { routePath: '/', summary: { p95Ms: 100 } },
          { routePath: '/login', summary: { p95Ms: 100 } },
        ],
      },
      tanstack: {
        routes: [{ routePath: '/', summary: { p95Ms: 100 } }],
      },
    },
  });

  assert.equal(gates.passed, true);
  assert.equal(gates.comparisons.length, 1);
  assert.equal(gates.frontendRouteCoverage.complete, false);
  assert.deepEqual(gates.frontendRouteCoverage.unmatchedNextRoutes, ['/login']);
});

test('runBenchmark requireAll fails compare reports with unmatched frontend routes', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('ok', {
      status: 200,
    });

  try {
    const report = await runBenchmark({
      apiThreshold: 0.1,
      frontendThreshold: 0.25,
      origins: {
        backend: 'http://backend.local',
        next: 'http://next.local',
        tanstack: 'http://tanstack.local',
      },
      profile: 'smoke',
      requireAll: true,
      samples: 1,
      setup: 'compare',
    });

    assert.equal(report.gates.passed, false);
    assert.match(report.gates.failures.join('\n'), /missing \/login/u);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runBenchmark rejects compare runs pointed at the same frontend origin', async () => {
  await assert.rejects(
    () =>
      runBenchmark({
        apiThreshold: 0.1,
        frontendThreshold: 0.25,
        origins: {
          backend: 'http://backend.local',
          next: 'https://frontend.local/next',
          tanstack: 'https://frontend.local/tanstack',
        },
        profile: 'smoke',
        requireAll: false,
        samples: 1,
        setup: 'compare',
      }),
    /distinct Next and TanStack origins/u
  );
});

test('writeReport keeps generated reports under ignored tmp benchmark output', () => {
  const report = {
    generatedAt: '2026-06-20T00:00:00.000Z',
    gates: { passed: true },
  };
  const writes = [];
  const fsImpl = {
    mkdirSync: (dirPath) => writes.push(['mkdir', dirPath]),
    writeFileSync: (filePath) => writes.push(['write', filePath]),
  };

  const reportPath = writeReport(report, undefined, fsImpl);

  assert.match(
    reportPath,
    /tmp\/benchmarks\/web-migration\/2026-06-20T00-00-00-000Z\/report\.json$/u
  );
  assert.equal(writes.length, 2);
  assert.throws(
    () => writeReport(report, '/tmp/outside-benchmark-output', fsImpl),
    /Benchmark reports must be written under tmp\/benchmarks\/web-migration/u
  );
});
