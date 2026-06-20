#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(
  ROOT_DIR,
  'tmp',
  'benchmarks',
  'web-migration'
);
const DEFAULT_FRONTEND_THRESHOLD = 0.25;
const DEFAULT_API_THRESHOLD = 0.1;
const SETUPS = ['next', 'tanstack', 'backend'];
const DEFAULT_ORIGINS = Object.freeze({
  backend: 'http://localhost:7820',
  next: 'https://tuturuuu.localhost',
  tanstack: 'https://tanstack.tuturuuu.localhost',
});
const ROUTES_BY_PROFILE = Object.freeze({
  smoke: {
    backend: ['/healthz', '/api/migration/status'],
    next: ['/', '/login'],
    tanstack: ['/'],
  },
  full: {
    backend: ['/healthz', '/readyz', '/api/migration/status'],
    next: ['/', '/login', '/personal', '/personal/tasks', '/personal/calendar'],
    tanstack: ['/', '/personal', '/personal/tasks', '/personal/calendar'],
  },
});
const METRIC_DEFINITIONS = Object.freeze({
  apiLatencyP50Ms: {
    label: 'representative API p50 latency',
    metric: 'api-latency-p50',
    thresholdType: 'api',
  },
  apiLatencyP95Ms: {
    label: 'representative API p95 latency',
    metric: 'api-latency-p95',
    thresholdType: 'api',
  },
  apiLatencyP99Ms: {
    label: 'representative API p99 latency',
    metric: 'api-latency-p99',
    thresholdType: 'api',
  },
  devReadyMs: {
    label: 'dev ready time',
    metric: 'dev-ready-time',
    thresholdType: 'frontend',
  },
  dockerBuildMs: {
    label: 'Docker build time',
    metric: 'docker-build-time',
    thresholdType: 'frontend',
  },
  e2ePassRate: {
    higherIsBetter: true,
    label: 'E2E pass rate',
    metric: 'e2e-pass-rate',
    thresholdType: 'strict',
  },
  e2eWallMs: {
    label: 'E2E wall time',
    metric: 'e2e-wall-time',
    thresholdType: 'frontend',
  },
  firstRouteColdMs: {
    label: 'first-route cold time',
    metric: 'first-route-cold-time',
    thresholdType: 'frontend',
  },
  imageSizeBytes: {
    label: 'image size',
    metric: 'image-size',
    thresholdType: 'frontend',
  },
  jsOutputBytes: {
    label: 'JS output size',
    metric: 'js-output-size',
    thresholdType: 'frontend',
  },
  productionCpuPercent: {
    label: 'production CPU baseline',
    metric: 'production-cpu-baseline',
    thresholdType: 'frontend',
  },
  productionRssBytes: {
    label: 'production RSS baseline',
    metric: 'production-rss-baseline',
    thresholdType: 'frontend',
  },
  warmNavigationMs: {
    label: 'warm navigation time',
    metric: 'warm-navigation-time',
    thresholdType: 'frontend',
  },
});
const OPTIONAL_COMPARE_METRICS = Object.freeze(Object.keys(METRIC_DEFINITIONS));

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBenchmarkOrigin(value, label) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    throw new Error(`${label} benchmark origin is required.`);
  }

  const normalizedValue = /^[a-z][a-z0-9+.-]*:\/\//iu.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;

  let url;
  try {
    url = new URL(normalizedValue);
  } catch {
    throw new Error(`Invalid ${label} benchmark origin: ${rawValue}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `${label} benchmark origin must use http or https; got ${url.protocol}`
    );
  }

  if (url.username || url.password) {
    throw new Error(`${label} benchmark origin must not include credentials.`);
  }

  return url.origin;
}

function getSelectedSetups(setup) {
  return setup === 'compare' ? [...SETUPS] : [setup];
}

function normalizeBenchmarkOrigins(origins, setup) {
  const selectedSetups = getSelectedSetups(setup);
  const normalized = { ...origins };

  for (const selectedSetup of selectedSetups) {
    normalized[selectedSetup] = normalizeBenchmarkOrigin(
      origins[selectedSetup],
      selectedSetup
    );
  }

  if (
    setup === 'compare' &&
    normalized.next &&
    normalized.tanstack &&
    normalized.next === normalized.tanstack
  ) {
    throw new Error(
      `Benchmark compare requires distinct Next and TanStack origins; both normalized to ${normalized.next}.`
    );
  }

  return normalized;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    apiThreshold: DEFAULT_API_THRESHOLD,
    backendToken: env.BACKEND_INTERNAL_TOKEN,
    frontendThreshold: DEFAULT_FRONTEND_THRESHOLD,
    origins: {
      backend: env.BACKEND_BENCHMARK_ORIGIN ?? DEFAULT_ORIGINS.backend,
      next: env.NEXT_WEB_BENCHMARK_ORIGIN ?? DEFAULT_ORIGINS.next,
      tanstack: env.TANSTACK_WEB_BENCHMARK_ORIGIN ?? DEFAULT_ORIGINS.tanstack,
    },
    evidencePath: env.WEB_BENCHMARK_EVIDENCE_PATH ?? null,
    outputDir: DEFAULT_OUTPUT_DIR,
    profile: 'smoke',
    requireAll: false,
    samples: parsePositiveInteger(env.WEB_BENCHMARK_SAMPLES, 3),
    setup: 'compare',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--setup') {
      args.setup = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--profile') {
      args.profile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--samples') {
      args.samples = parsePositiveInteger(argv[index + 1], args.samples);
      index += 1;
      continue;
    }

    if (arg === '--next-origin') {
      args.origins.next = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--tanstack-origin') {
      args.origins.tanstack = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--backend-origin') {
      args.origins.backend = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--evidence') {
      args.evidencePath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output-dir') {
      args.outputDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--frontend-threshold') {
      args.frontendThreshold = Number.parseFloat(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--api-threshold') {
      args.apiThreshold = Number.parseFloat(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--require-all') {
      args.requireAll = true;
      continue;
    }

    if (arg === '--insecure') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (![...SETUPS, 'compare'].includes(args.setup)) {
    throw new Error(`Unsupported setup: ${args.setup}`);
  }

  if (!ROUTES_BY_PROFILE[args.profile]) {
    throw new Error(`Unsupported profile: ${args.profile}`);
  }

  args.origins = normalizeBenchmarkOrigins(args.origins, args.setup);

  return args;
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;

  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function isInsideDirectory(candidatePath, parentPath) {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function normalizeMetricValue(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function readEvidence(evidencePath, fsImpl = fs) {
  if (!evidencePath) {
    return null;
  }

  return JSON.parse(fsImpl.readFileSync(evidencePath, 'utf8'));
}

function normalizeEvidenceMetrics(evidence = null) {
  const source = evidence?.metrics ?? evidence ?? {};
  const normalized = {};

  for (const setup of SETUPS) {
    const setupMetrics = source[setup];

    if (!setupMetrics || typeof setupMetrics !== 'object') {
      continue;
    }

    normalized[setup] = {};

    for (const metricKey of OPTIONAL_COMPARE_METRICS) {
      const value = normalizeMetricValue(setupMetrics[metricKey]);

      if (value != null) {
        normalized[setup][metricKey] = value;
      }
    }
  }

  return normalized;
}

function normalizeAcceptedRegressions(evidence = null) {
  const accepted = [];
  const raw = evidence?.acceptedRegressions ?? evidence?.acceptedNotes ?? [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object' || !item.metric || !item.note) {
        continue;
      }

      accepted.push({
        metric: String(item.metric),
        note: String(item.note),
        routePath: item.routePath == null ? null : String(item.routePath),
      });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [metric, note] of Object.entries(raw)) {
      if (note) {
        accepted.push({ metric, note: String(note), routePath: null });
      }
    }
  }

  return accepted;
}

function findAcceptedRegression(acceptedRegressions, metric, routePath = null) {
  return acceptedRegressions.find(
    (item) =>
      item.metric === metric &&
      (item.routePath == null || item.routePath === routePath)
  );
}

function summarizeDurations(samples) {
  const successfulSamples = samples.filter((sample) => sample.ok);
  const durations = successfulSamples.map((sample) => sample.durationMs);
  const warmDurations = successfulSamples
    .slice(1)
    .map((sample) => sample.durationMs);

  return {
    coldMs: successfulSamples[0]?.durationMs ?? null,
    count: samples.length,
    failed: samples.filter((sample) => !sample.ok).length,
    maxMs: percentile(durations, 100),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    warmP50Ms: percentile(warmDurations, 50),
    warmP95Ms: percentile(warmDurations, 95),
    warmP99Ms: percentile(warmDurations, 99),
  };
}

function resolveUrl(origin, routePath) {
  return new URL(routePath, origin).toString();
}

function getRouteHeaders({ backendToken, routePath, setup }) {
  if (
    setup === 'backend' &&
    backendToken &&
    routePath.startsWith('/api/migration/')
  ) {
    return {
      authorization: `Bearer ${backendToken}`,
    };
  }

  return undefined;
}

async function timeFetch(url, init = {}) {
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: init.headers,
      redirect: 'manual',
    });
    await response.arrayBuffer();

    return {
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      url,
    };
  } catch (error) {
    return {
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      url,
    };
  }
}

async function collectSetupMetrics({
  backendToken,
  origin,
  routes,
  samples,
  setup,
}) {
  const routeResults = [];

  for (const routePath of routes) {
    const sampleResults = [];
    const url = resolveUrl(origin, routePath);
    const headers = getRouteHeaders({
      backendToken,
      routePath,
      setup,
    });

    for (let index = 0; index < samples; index += 1) {
      sampleResults.push(await timeFetch(url, { headers }));
    }

    routeResults.push({
      routePath,
      samples: sampleResults,
      summary: summarizeDurations(sampleResults),
      url,
    });
  }

  return {
    origin,
    routes: routeResults,
    setup,
  };
}

function summarizeFrontendRouteCoverage(nextSetup, tanstackSetup) {
  if (!nextSetup || !tanstackSetup) {
    return null;
  }

  const nextRoutes = nextSetup.routes.map((route) => route.routePath);
  const tanstackRoutes = tanstackSetup.routes.map((route) => route.routePath);
  const nextRouteSet = new Set(nextRoutes);
  const tanstackRouteSet = new Set(tanstackRoutes);
  const matchedRoutes = nextRoutes.filter((routePath) =>
    tanstackRouteSet.has(routePath)
  );

  return {
    complete:
      matchedRoutes.length === nextRoutes.length &&
      matchedRoutes.length === tanstackRoutes.length,
    matchedRoutes,
    nextRoutes,
    tanstackRoutes,
    unmatchedNextRoutes: nextRoutes.filter(
      (routePath) => !tanstackRouteSet.has(routePath)
    ),
    unmatchedTanstackRoutes: tanstackRoutes.filter(
      (routePath) => !nextRouteSet.has(routePath)
    ),
  };
}

function getThreshold(metricDefinition, apiThreshold, frontendThreshold) {
  if (metricDefinition.thresholdType === 'api') {
    return apiThreshold;
  }

  if (metricDefinition.thresholdType === 'strict') {
    return 0;
  }

  return frontendThreshold;
}

function compareValueMetric({
  acceptedRegressions,
  apiThreshold,
  baselineSetup,
  baselineValue,
  candidateSetup,
  candidateValue,
  frontendThreshold,
  metricDefinition,
}) {
  const threshold = getThreshold(
    metricDefinition,
    apiThreshold,
    frontendThreshold
  );
  const ratio = metricDefinition.higherIsBetter
    ? baselineValue / candidateValue - 1
    : candidateValue / baselineValue - 1;
  const accepted = findAcceptedRegression(
    acceptedRegressions,
    metricDefinition.metric
  );
  const passed = ratio <= threshold || Boolean(accepted);

  return {
    acceptedNote: accepted?.note ?? null,
    baselineSetup,
    baselineValue,
    candidateSetup,
    candidateValue,
    metric: metricDefinition.metric,
    passed,
    ratio,
    threshold,
  };
}

function compareAdditionalMetrics({
  acceptedRegressions = [],
  apiThreshold,
  frontendThreshold,
  metrics = {},
}) {
  const comparisons = [];
  const missing = [];

  for (const [metricKey, metricDefinition] of Object.entries(
    METRIC_DEFINITIONS
  )) {
    const baselineSetup =
      metricDefinition.thresholdType === 'api' ? 'next' : 'next';
    const candidateSetup =
      metricDefinition.thresholdType === 'api' ? 'backend' : 'tanstack';
    const baselineValue = metrics[baselineSetup]?.[metricKey];
    const candidateValue = metrics[candidateSetup]?.[metricKey];

    if (baselineValue == null || candidateValue == null) {
      missing.push({
        baselineSetup,
        candidateSetup,
        label: metricDefinition.label,
        metric: metricDefinition.metric,
      });
      continue;
    }

    if (baselineValue <= 0 || candidateValue <= 0) {
      missing.push({
        baselineSetup,
        candidateSetup,
        label: `${metricDefinition.label} has non-positive evidence`,
        metric: metricDefinition.metric,
      });
      continue;
    }

    comparisons.push(
      compareValueMetric({
        acceptedRegressions,
        apiThreshold,
        baselineSetup,
        baselineValue,
        candidateSetup,
        candidateValue,
        frontendThreshold,
        metricDefinition,
      })
    );
  }

  return { comparisons, missing };
}

function compareSetupMetrics({
  acceptedRegressions = [],
  apiThreshold,
  frontendThreshold,
  metrics = {},
  setups,
}) {
  const comparisons = [];
  const failures = [];
  const nextSetup = setups.next;
  const tanstackSetup = setups.tanstack;
  const frontendRouteCoverage = summarizeFrontendRouteCoverage(
    nextSetup,
    tanstackSetup
  );

  if (nextSetup && tanstackSetup) {
    for (const nextRoute of nextSetup.routes) {
      const tanstackRoute = tanstackSetup.routes.find(
        (candidate) => candidate.routePath === nextRoute.routePath
      );

      if (!tanstackRoute) {
        continue;
      }

      const nextP95 = nextRoute.summary.p95Ms;
      const tanstackP95 = tanstackRoute.summary.p95Ms;

      if (nextP95 == null || tanstackP95 == null) {
        continue;
      }

      const ratio = tanstackP95 / nextP95 - 1;
      const accepted = findAcceptedRegression(
        acceptedRegressions,
        'frontend-route-p95',
        nextRoute.routePath
      );
      const comparison = {
        acceptedNote: accepted?.note ?? null,
        baselineP95Ms: nextP95,
        candidateP95Ms: tanstackP95,
        metric: 'frontend-route-p95',
        passed: ratio <= frontendThreshold || Boolean(accepted),
        ratio,
        routePath: nextRoute.routePath,
        threshold: frontendThreshold,
      };
      comparisons.push(comparison);

      if (!comparison.passed) {
        failures.push(
          `TanStack ${nextRoute.routePath} p95 regressed by ${Math.round(
            ratio * 100
          )}%`
        );
      }
    }
  }

  const additional = compareAdditionalMetrics({
    acceptedRegressions,
    apiThreshold,
    frontendThreshold,
    metrics,
  });
  comparisons.push(...additional.comparisons);

  for (const comparison of additional.comparisons) {
    if (!comparison.passed) {
      failures.push(
        `${comparison.candidateSetup} ${comparison.metric} regressed by ${Math.round(
          comparison.ratio * 100
        )}%`
      );
    }
  }

  const backendSetup = setups.backend;
  if (backendSetup) {
    for (const route of backendSetup.routes) {
      if (route.summary.failed > 0) {
        failures.push(`Backend ${route.routePath} had failed samples.`);
      }

      if (route.summary.p95Ms != null && route.summary.p95Ms > 1000) {
        failures.push(
          `Backend ${route.routePath} p95 exceeded the 1000ms smoke ceiling.`
        );
      }
    }
  }

  return {
    apiThreshold,
    comparisons,
    failures,
    frontendRouteCoverage,
    frontendThreshold,
    missingOptionalMetrics: additional.missing,
    passed: failures.length === 0,
  };
}

async function runBenchmark(options) {
  const profileRoutes = ROUTES_BY_PROFILE[options.profile];
  const selectedSetups = getSelectedSetups(options.setup);
  const origins = normalizeBenchmarkOrigins(options.origins, options.setup);
  const setups = {};
  const evidence = readEvidence(options.evidencePath);
  const acceptedRegressions = normalizeAcceptedRegressions(evidence);
  const metrics = normalizeEvidenceMetrics(evidence);

  for (const setup of selectedSetups) {
    setups[setup] = await collectSetupMetrics({
      backendToken: options.backendToken,
      origin: origins[setup],
      routes: profileRoutes[setup],
      samples: options.samples,
      setup,
    });
  }

  const gates = compareSetupMetrics({
    acceptedRegressions,
    apiThreshold: options.apiThreshold,
    frontendThreshold: options.frontendThreshold,
    metrics,
    setups,
  });

  if (options.requireAll) {
    const coverage = gates.frontendRouteCoverage;
    if (options.setup === 'compare' && coverage && !coverage.complete) {
      for (const routePath of coverage.unmatchedNextRoutes) {
        gates.failures.push(`TanStack benchmark is missing ${routePath}.`);
      }

      for (const routePath of coverage.unmatchedTanstackRoutes) {
        gates.failures.push(`Next benchmark is missing ${routePath}.`);
      }
    }

    for (const setup of selectedSetups) {
      for (const route of setups[setup].routes) {
        if (route.summary.failed > 0) {
          gates.failures.push(`${setup} ${route.routePath} is not reachable.`);
        }
      }
    }

    if (options.setup === 'compare') {
      for (const missing of gates.missingOptionalMetrics) {
        gates.failures.push(
          `Missing benchmark evidence for ${missing.metric} (${missing.label}) comparing ${missing.baselineSetup} to ${missing.candidateSetup}.`
        );
      }
    }

    gates.passed = gates.failures.length === 0;
  }

  return {
    generatedAt: new Date().toISOString(),
    gates,
    metrics,
    profile: options.profile,
    samples: options.samples,
    setup: options.setup,
    setups,
  };
}

function writeReport(report, outputDir = DEFAULT_OUTPUT_DIR, fsImpl = fs) {
  const resolvedOutputDir = path.resolve(outputDir);

  if (!isInsideDirectory(resolvedOutputDir, DEFAULT_OUTPUT_DIR)) {
    throw new Error(
      `Benchmark reports must be written under ${path.relative(
        ROOT_DIR,
        DEFAULT_OUTPUT_DIR
      )}; got ${path.relative(ROOT_DIR, resolvedOutputDir)}.`
    );
  }

  const stamp = report.generatedAt.replace(/[:.]/gu, '-');
  const reportDir = path.join(resolvedOutputDir, stamp);
  const reportPath = path.join(reportDir, 'report.json');

  fsImpl.mkdirSync(reportDir, { recursive: true });
  fsImpl.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return reportPath;
}

function printHelp() {
  console.log(`Usage: bun benchmark:web-setups -- [options]

Options:
  --setup next|tanstack|backend|compare
  --profile smoke|full
  --samples <count>
  --next-origin <origin>
  --tanstack-origin <origin>
  --backend-origin <origin>
  --evidence <path>
  --output-dir <path>
  --frontend-threshold <ratio>
  --api-threshold <ratio>
  --require-all
  --insecure
`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const report = await runBenchmark(options);
  const reportPath = writeReport(report, options.outputDir);

  console.log(
    `Benchmark report written to ${path.relative(ROOT_DIR, reportPath)}`
  );
  if (!report.gates.passed) {
    console.error(report.gates.failures.join('\n'));
    return 1;
  }

  return 0;
}

if (require.main === module) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}

module.exports = {
  compareSetupMetrics,
  compareAdditionalMetrics,
  METRIC_DEFINITIONS,
  getRouteHeaders,
  normalizeBenchmarkOrigin,
  normalizeBenchmarkOrigins,
  normalizeAcceptedRegressions,
  normalizeEvidenceMetrics,
  parseArgs,
  percentile,
  runBenchmark,
  summarizeFrontendRouteCoverage,
  summarizeDurations,
  timeFetch,
  writeReport,
};
