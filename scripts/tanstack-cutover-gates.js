#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  checkManifest,
  inventoryNextAppRoutes,
} = require('./tanstack-migration-manifest.js');
const { METRIC_DEFINITIONS } = require('./benchmark-web-setups.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_APP_DIR = path.join(ROOT_DIR, 'apps', 'web', 'src', 'app');
const DEFAULT_MANIFEST_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'migration',
  'route-manifest.json'
);
const DEFAULT_OVERRIDES_PATH = path.join(
  ROOT_DIR,
  'apps',
  'tanstack-web',
  'migration',
  'route-overrides.json'
);
const DEFAULT_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_EVIDENCE_SKEW_MS = 5 * 60 * 1000;
const BACKEND_ROUTE_KINDS = new Set(['api', 'cron', 'route-handler', 'trpc']);
const REQUIRED_BENCHMARK_COMPARISONS = Object.freeze([
  'frontend-route-p95',
  ...Object.values(METRIC_DEFINITIONS).map((definition) => definition.metric),
]);
const REQUIRED_E2E_REGRESSION_METRICS = Object.freeze([
  { key: 'passRate', label: 'pass rate', threshold: 0, higherIsBetter: true },
  { key: 'wallMs', label: 'wall time', threshold: 0.25 },
]);
const REQUIRED_CLOUDFLARE_SMOKE_PROBES = Object.freeze([
  'backend-health',
  'backend-ready',
  'backend-migration-status',
  'backend-migration-status-missing-token',
  'backend-migration-status-invalid-token',
  'tanstack-root',
]);
const REQUIRED_CLOUDFLARE_SMOKE_REPORTER =
  'scripts/smoke-cloudflare-workers.js';

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    appDir: DEFAULT_APP_DIR,
    benchmarkProfile: 'full',
    benchmarkReportPath: null,
    benchmarkSetup: 'compare',
    cloudflareSmokeReportPath: null,
    e2eReportPath: null,
    evidenceMaxAgeMs: DEFAULT_EVIDENCE_MAX_AGE_MS,
    manifestPath: DEFAULT_MANIFEST_PATH,
    outputPath: null,
    overridesPath: DEFAULT_OVERRIDES_PATH,
    requireBenchmark: true,
    requireCloudflareSmoke: true,
    requireE2E: true,
    requireMigrated: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-dir') {
      args.appDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--manifest') {
      args.manifestPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--overrides') {
      args.overridesPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--benchmark-report') {
      args.benchmarkReportPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--benchmark-profile') {
      args.benchmarkProfile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--benchmark-setup') {
      args.benchmarkSetup = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--e2e-report') {
      args.e2eReportPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--evidence-max-age-ms') {
      args.evidenceMaxAgeMs = parsePositiveInteger(
        argv[index + 1],
        args.evidenceMaxAgeMs
      );
      index += 1;
      continue;
    }

    if (arg === '--cloudflare-smoke-report') {
      args.cloudflareSmokeReportPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--output') {
      args.outputPath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--allow-legacy') {
      args.requireMigrated = false;
      continue;
    }

    if (arg === '--skip-benchmark') {
      args.requireBenchmark = false;
      continue;
    }

    if (arg === '--skip-cloudflare-smoke') {
      args.requireCloudflareSmoke = false;
      continue;
    }

    if (arg === '--skip-e2e') {
      args.requireE2E = false;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function countManifestRoutes(routes) {
  const counts = {
    acceptedRemoval: 0,
    backendOwned: 0,
    backendRouteArtifacts: 0,
    frontendOwned: 0,
    legacyNext: 0,
    migrated: 0,
    total: routes.length,
    unknownStatus: 0,
    unmapped: 0,
  };

  for (const route of routes) {
    if (route.status === 'accepted-removal') {
      counts.acceptedRemoval += 1;
    } else if (route.status === 'legacy-next') {
      counts.legacyNext += 1;
    } else if (route.status === 'migrated') {
      counts.migrated += 1;
    } else {
      counts.unknownStatus += 1;
    }

    if (route.targetOwner === 'rust-backend') {
      counts.backendOwned += 1;
    } else if (route.targetOwner === 'tanstack-start') {
      counts.frontendOwned += 1;
    } else {
      counts.unmapped += 1;
    }

    if (BACKEND_ROUTE_KINDS.has(route.kind)) {
      counts.backendRouteArtifacts += 1;
    }
  }

  return counts;
}

function gate(id, label, ok, detail) {
  return {
    detail,
    id,
    label,
    ok,
    status: ok ? 'pass' : 'blocked',
  };
}

function formatDurationMs(durationMs) {
  const minutes = Math.round(durationMs / 60_000);

  if (minutes < 120) {
    return `${minutes} minutes`;
  }

  return `${Math.round(minutes / 60)} hours`;
}

function validateEvidenceFreshness(
  report,
  label,
  { maxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS, nowMs = Date.now() } = {}
) {
  const failures = [];
  const generatedAtMs = Date.parse(String(report?.generatedAt ?? ''));

  if (!Number.isFinite(generatedAtMs)) {
    return [`${label} report is missing a valid generatedAt timestamp.`];
  }

  if (generatedAtMs > nowMs + FUTURE_EVIDENCE_SKEW_MS) {
    failures.push(`${label} report generatedAt is in the future.`);
  }

  const ageMs = Math.max(0, nowMs - generatedAtMs);

  if (ageMs > maxAgeMs) {
    failures.push(
      `${label} report is stale: generatedAt is ${formatDurationMs(
        ageMs
      )} old, exceeding the ${formatDurationMs(maxAgeMs)} max age.`
    );
  }

  return failures;
}

function checkManifestGates({
  appDir = DEFAULT_APP_DIR,
  fsImpl = fs,
  manifestPath = DEFAULT_MANIFEST_PATH,
  overridesPath = DEFAULT_OVERRIDES_PATH,
  requireMigrated = true,
  rootDir = ROOT_DIR,
} = {}) {
  const manifest = readJson(manifestPath, fsImpl);
  const inventory = inventoryNextAppRoutes({
    appDir,
    fsImpl,
    overridesPath,
    rootDir,
  });
  const currentErrors = checkManifest({
    appDir,
    fsImpl,
    manifestPath,
    overridesPath,
    requireMigrated,
    rootDir,
  });
  const counts = countManifestRoutes(manifest.routes);
  const backendMapped = counts.backendOwned === counts.backendRouteArtifacts;
  const terminalStatuses =
    counts.total === counts.acceptedRemoval + counts.migrated;
  const noLegacy = counts.legacyNext === 0;
  const noUnmapped = counts.unmapped === 0 && counts.unknownStatus === 0;
  const current = currentErrors.filter(
    (error) => !/^Cutover check requires migrated ownership/u.test(error)
  );

  const gates = [
    gate(
      'route-manifest-current',
      'Route manifest parity',
      current.length === 0,
      current.length === 0
        ? `Manifest tracks ${inventory.summary.total} current route artifacts.`
        : current.join('\n\n')
    ),
    gate(
      'no-legacy-routes',
      'No legacy route ownership',
      !requireMigrated || noLegacy,
      `${counts.legacyNext} route artifacts still have legacy-next status.`
    ),
    gate(
      'no-unmapped-routes',
      'No unmapped route artifacts',
      noUnmapped,
      `${counts.unmapped} routes are unmapped and ${counts.unknownStatus} routes have unknown status.`
    ),
    gate(
      'backend-owned-routes-mapped',
      'Backend-owned handlers mapped',
      backendMapped,
      `${counts.backendOwned} of ${counts.backendRouteArtifacts} backend route artifacts target the Rust backend.`
    ),
    gate(
      'terminal-migration-statuses',
      'Terminal migration statuses',
      !requireMigrated || terminalStatuses,
      `${counts.migrated} migrated and ${counts.acceptedRemoval} accepted-removal artifacts recorded.`
    ),
  ];

  return {
    counts,
    gates,
    ok: gates.every((item) => item.ok),
    summary: manifest.summary,
  };
}

function routeFailed(route) {
  return Number(route?.summary?.failed ?? 0) > 0;
}

function sampleStatusFailed(sample) {
  const status = Number(sample?.status);

  return !Number.isFinite(status) || status < 200 || status >= 400;
}

function comparisonHasAcceptedNote(comparison) {
  return (
    typeof comparison?.acceptedNote === 'string' &&
    comparison.acceptedNote.trim().length > 0
  );
}

function findComparison(report, metric) {
  return (report.gates?.comparisons ?? []).find(
    (comparison) => comparison.metric === metric
  );
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function hasPositiveNumber(value) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0;
}

function normalizeBenchmarkEvidenceOrigin(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      failure: `${label} is missing benchmark origin evidence.`,
      origin: null,
    };
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        failure: `${label} benchmark origin must use http or https.`,
        origin: null,
      };
    }

    return {
      failure: null,
      origin: url.origin,
    };
  } catch {
    return {
      failure: `${label} has invalid benchmark origin evidence.`,
      origin: null,
    };
  }
}

function validateUrlMatchesOrigin(value, expectedOrigin, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return `${label} is missing URL origin evidence.`;
  }

  try {
    const actualOrigin = new URL(value).origin;

    if (actualOrigin !== expectedOrigin) {
      return `${label} origin ${actualOrigin} does not match setup origin ${expectedOrigin}.`;
    }

    return null;
  } catch {
    return `${label} has invalid URL evidence.`;
  }
}

function validateBenchmarkOriginEvidence(report, expectedSetup) {
  const failures = [];
  const origins = {};
  const setups =
    expectedSetup === 'compare'
      ? ['next', 'tanstack', 'backend']
      : [expectedSetup];

  for (const setup of setups) {
    const setupMetrics = report.setups?.[setup];

    if (!setupMetrics) {
      continue;
    }

    const normalized = normalizeBenchmarkEvidenceOrigin(
      setupMetrics.origin,
      setup
    );

    if (normalized.failure) {
      failures.push(normalized.failure);
      continue;
    }

    origins[setup] = normalized.origin;

    for (const route of setupMetrics.routes ?? []) {
      const routeLabel = `${setup} ${route?.routePath ?? 'unknown route'}`;
      const routeFailure = validateUrlMatchesOrigin(
        route?.url,
        normalized.origin,
        `${routeLabel} route`
      );

      if (routeFailure) {
        failures.push(routeFailure);
      }

      for (const [index, sample] of (route?.samples ?? []).entries()) {
        const sampleFailure = validateUrlMatchesOrigin(
          sample?.url,
          normalized.origin,
          `${routeLabel} sample ${index + 1}`
        );

        if (sampleFailure) {
          failures.push(sampleFailure);
        }
      }
    }
  }

  if (
    expectedSetup === 'compare' &&
    origins.next &&
    origins.tanstack &&
    origins.next === origins.tanstack
  ) {
    failures.push(
      `Benchmark report must use distinct Next and TanStack origins; both normalized to ${origins.next}.`
    );
  }

  return {
    failures,
    origins,
  };
}

function normalizeE2EOriginEvidence(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      failure: `${label} is missing E2E origin evidence.`,
      origin: null,
    };
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        failure: `${label} E2E origin must use http or https.`,
        origin: null,
      };
    }

    if (url.username || url.password) {
      return {
        failure: `${label} E2E origin must not include credentials.`,
        origin: null,
      };
    }

    return {
      failure: null,
      origin: url.origin,
    };
  } catch {
    return {
      failure: `${label} has invalid E2E origin evidence.`,
      origin: null,
    };
  }
}

function validateE2EOriginEvidence(report, frontends) {
  const failures = [];
  const origins = {};

  for (const frontend of ['next', 'tanstack']) {
    const normalized = normalizeE2EOriginEvidence(
      frontends[frontend]?.origin ?? report.origins?.[frontend],
      frontend
    );

    if (normalized.failure) {
      failures.push(normalized.failure);
      continue;
    }

    origins[frontend] = normalized.origin;
  }

  if (origins.next && origins.tanstack && origins.next === origins.tanstack) {
    failures.push(
      `E2E report must use distinct Next and TanStack origins; both normalized to ${origins.next}.`
    );
  }

  return {
    failures,
    origins,
  };
}

function validateRequiredBenchmarkComparison(comparison) {
  const failures = [];

  if (!isFiniteNumber(comparison.ratio)) {
    failures.push(`${comparison.metric} is missing numeric ratio evidence.`);
  }

  if (!isFiniteNumber(comparison.threshold)) {
    failures.push(
      `${comparison.metric} is missing numeric threshold evidence.`
    );
  }

  if (comparison.metric === 'frontend-route-p95') {
    if (
      typeof comparison.routePath !== 'string' ||
      !comparison.routePath.trim()
    ) {
      failures.push('frontend-route-p95 is missing route path evidence.');
    }

    if (!hasPositiveNumber(comparison.baselineP95Ms)) {
      failures.push('frontend-route-p95 is missing baseline p95 evidence.');
    }

    if (!hasPositiveNumber(comparison.candidateP95Ms)) {
      failures.push('frontend-route-p95 is missing candidate p95 evidence.');
    }

    return failures;
  }

  if (!hasPositiveNumber(comparison.baselineValue)) {
    failures.push(`${comparison.metric} is missing baseline value evidence.`);
  }

  if (!hasPositiveNumber(comparison.candidateValue)) {
    failures.push(`${comparison.metric} is missing candidate value evidence.`);
  }

  return failures;
}

function validateBenchmarkReport(report, options = {}) {
  const failures = [];
  const expectedSetup = options.benchmarkSetup ?? 'compare';
  const expectedProfile = options.benchmarkProfile ?? 'full';
  const originValidation = validateBenchmarkOriginEvidence(
    report,
    expectedSetup
  );
  failures.push(...originValidation.failures);

  if (report.setup !== expectedSetup) {
    failures.push(
      `Benchmark setup must be ${expectedSetup}; got ${report.setup ?? 'missing'}.`
    );
  }

  if (report.profile !== expectedProfile) {
    failures.push(
      `Benchmark profile must be ${expectedProfile}; got ${report.profile ?? 'missing'}.`
    );
  }

  for (const setup of ['next', 'tanstack', 'backend']) {
    const setupMetrics = report.setups?.[setup];

    if (!setupMetrics) {
      failures.push(`Benchmark report is missing ${setup} setup metrics.`);
      continue;
    }

    if (
      !Array.isArray(setupMetrics.routes) ||
      setupMetrics.routes.length === 0
    ) {
      failures.push(`Benchmark report is missing ${setup} route metrics.`);
      continue;
    }

    for (const route of setupMetrics.routes) {
      if (routeFailed(route)) {
        failures.push(`${setup} ${route.routePath} had failed samples.`);
      }

      if (!Array.isArray(route.samples) || route.samples.length === 0) {
        failures.push(
          `${setup} ${route.routePath} is missing benchmark samples.`
        );
        continue;
      }

      for (const sample of route.samples) {
        if (sampleStatusFailed(sample)) {
          failures.push(
            `${setup} ${route.routePath} returned benchmark status ${
              sample?.status ?? 'missing'
            }.`
          );
          break;
        }
      }
    }
  }

  if (
    expectedSetup === 'compare' &&
    !report.gates?.comparisons?.some(
      (comparison) => comparison.metric === 'frontend-route-p95'
    )
  ) {
    failures.push(
      'Benchmark report is missing frontend-route-p95 compare evidence.'
    );
  }

  if (expectedSetup === 'compare') {
    for (const metric of REQUIRED_BENCHMARK_COMPARISONS) {
      const comparison = findComparison(report, metric);

      if (!comparison) {
        failures.push(
          `Benchmark report is missing required ${metric} regression evidence.`
        );
        continue;
      }

      failures.push(...validateRequiredBenchmarkComparison(comparison));

      if (
        comparison.passed === false &&
        !comparisonHasAcceptedNote(comparison)
      ) {
        failures.push(
          `${comparison.metric} regression exceeded threshold ${comparison.threshold}.`
        );
      }
    }
  }

  if (expectedSetup === 'compare') {
    const coverage = report.gates?.frontendRouteCoverage;

    if (!coverage) {
      failures.push('Benchmark report is missing frontend route coverage.');
    } else {
      const unmatchedNextRoutes = coverage.unmatchedNextRoutes ?? [];
      const unmatchedTanstackRoutes = coverage.unmatchedTanstackRoutes ?? [];

      if (
        coverage.complete !== true ||
        unmatchedNextRoutes.length > 0 ||
        unmatchedTanstackRoutes.length > 0
      ) {
        const details = [
          unmatchedNextRoutes.length > 0
            ? `missing from TanStack: ${unmatchedNextRoutes.join(', ')}`
            : null,
          unmatchedTanstackRoutes.length > 0
            ? `missing from Next: ${unmatchedTanstackRoutes.join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('; ');

        failures.push(
          details
            ? `Benchmark report has incomplete frontend route coverage (${details}).`
            : 'Benchmark report has incomplete frontend route coverage.'
        );
      }
    }
  }

  for (const failure of report.gates?.failures ?? []) {
    failures.push(String(failure));
  }

  for (const comparison of report.gates?.comparisons ?? []) {
    if (comparison.passed === false && !comparisonHasAcceptedNote(comparison)) {
      failures.push(
        `${comparison.metric} ${comparison.routePath} exceeded threshold ${comparison.threshold}.`
      );
    }
  }

  if (report.gates?.passed !== true) {
    failures.push('Benchmark report gates did not pass.');
  }

  return {
    failures,
    ok: failures.length === 0,
    origins: originValidation.origins,
  };
}

function checkBenchmarkGate({
  benchmarkProfile,
  benchmarkReportPath,
  benchmarkSetup,
  evidenceMaxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
  evidenceNowMs,
  fsImpl = fs,
  requireBenchmark = true,
} = {}) {
  if (!benchmarkReportPath) {
    return {
      gate: gate(
        'benchmark-compare',
        'Benchmark compare',
        !requireBenchmark,
        requireBenchmark
          ? 'No benchmark report was provided.'
          : 'Benchmark report was not required for this run.'
      ),
      report: null,
    };
  }

  const report = readJson(benchmarkReportPath, fsImpl);
  const validation = validateBenchmarkReport(report, {
    benchmarkProfile,
    benchmarkSetup,
  });
  const failures = [
    ...validation.failures,
    ...validateEvidenceFreshness(report, 'Benchmark', {
      maxAgeMs: evidenceMaxAgeMs,
      nowMs: evidenceNowMs,
    }),
  ];

  return {
    gate: gate(
      'benchmark-compare',
      'Benchmark compare',
      failures.length === 0,
      failures.length === 0
        ? `Benchmark ${report.setup}/${report.profile} passed.`
        : failures.join('\n')
    ),
    report: {
      generatedAt: report.generatedAt,
      origins: validation.origins,
      profile: report.profile,
      setup: report.setup,
    },
  };
}

function isPassedE2EStatus(status) {
  return ['passed', 'pass', 'ok', 'success'].includes(
    String(status ?? '').toLowerCase()
  );
}

function validateE2EReport(report) {
  const failures = [];

  if (report.frontend !== 'compare') {
    failures.push('E2E report must be generated with frontend compare mode.');
  } else if (!isPassedE2EStatus(report.status) && report.passed !== true) {
    failures.push('E2E compare report did not pass.');
  }

  const frontends = report.frontends ?? report.results ?? {};
  const originValidation = validateE2EOriginEvidence(report, frontends);

  for (const frontend of ['next', 'tanstack']) {
    const result = frontends[frontend];

    if (!result) {
      failures.push(`E2E report is missing ${frontend} frontend result.`);
      continue;
    }

    if (result.passed !== true && !isPassedE2EStatus(result.status)) {
      failures.push(`${frontend} E2E status is ${result.status ?? 'missing'}.`);
    }
  }

  if (Array.isArray(report.failedTests) && report.failedTests.length > 0) {
    failures.push(`E2E report has ${report.failedTests.length} failed tests.`);
  }

  failures.push(...originValidation.failures);

  for (const metric of REQUIRED_E2E_REGRESSION_METRICS) {
    const nextValue = Number(frontends.next?.[metric.key]);
    const tanstackValue = Number(frontends.tanstack?.[metric.key]);

    if (!Number.isFinite(nextValue) || !Number.isFinite(tanstackValue)) {
      failures.push(
        `E2E report is missing ${metric.label} regression evidence.`
      );
      continue;
    }

    if (nextValue <= 0 || tanstackValue <= 0) {
      failures.push(
        `E2E report has invalid ${metric.label} regression evidence.`
      );
      continue;
    }

    const ratio = metric.higherIsBetter
      ? nextValue / tanstackValue - 1
      : tanstackValue / nextValue - 1;
    const acceptedNote =
      report.acceptedRegressions?.[metric.key] ??
      report.acceptedNotes?.[metric.key] ??
      null;

    if (ratio > metric.threshold && !acceptedNote) {
      failures.push(
        `TanStack E2E ${metric.label} regressed by ${Math.round(
          ratio * 100
        )}% without an accepted note.`
      );
    }
  }

  return {
    failures,
    ok: failures.length === 0,
    origins: originValidation.origins,
  };
}

function normalizeCloudflareSmokeOrigin(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return {
      failure: `Cloudflare smoke report is missing ${label} evidence.`,
      origin: null,
    };
  }

  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        failure: `Cloudflare smoke ${label} must use http or https.`,
        origin: null,
      };
    }

    if (url.username || url.password) {
      return {
        failure: `Cloudflare smoke ${label} must not include credentials.`,
        origin: null,
      };
    }

    return {
      failure: null,
      origin: url.origin,
    };
  } catch {
    return {
      failure: `Cloudflare smoke report has invalid ${label} evidence.`,
      origin: null,
    };
  }
}

function validateCloudflareSmokeUrlMatchesOrigin(value, expectedOrigin, label) {
  if (typeof value !== 'string' || !value.trim()) {
    return `${label} is missing URL evidence.`;
  }

  try {
    const actualOrigin = new URL(value).origin;

    if (actualOrigin !== expectedOrigin) {
      return `${label} origin ${actualOrigin} does not match Cloudflare smoke origin ${expectedOrigin}.`;
    }

    return null;
  } catch {
    return `${label} has invalid URL evidence.`;
  }
}

function validateCloudflareSmokeProvenance(report, resultById) {
  const failures = [];
  const provenance = report.provenance ?? {};

  if (provenance.reporter !== REQUIRED_CLOUDFLARE_SMOKE_REPORTER) {
    failures.push(
      `Cloudflare smoke report must be generated by ${REQUIRED_CLOUDFLARE_SMOKE_REPORTER}.`
    );
  }

  const backendOrigin = normalizeCloudflareSmokeOrigin(
    provenance.backendOrigin,
    'backendOrigin'
  );
  const tanstackOrigin = normalizeCloudflareSmokeOrigin(
    provenance.tanstackOrigin,
    'tanstackOrigin'
  );

  if (backendOrigin.failure) {
    failures.push(backendOrigin.failure);
  }

  if (tanstackOrigin.failure) {
    failures.push(tanstackOrigin.failure);
  }

  if (
    backendOrigin.origin &&
    tanstackOrigin.origin &&
    backendOrigin.origin === tanstackOrigin.origin
  ) {
    failures.push(
      `Cloudflare smoke report must use distinct backend and TanStack origins; both normalized to ${backendOrigin.origin}.`
    );
  }

  for (const requiredProbe of REQUIRED_CLOUDFLARE_SMOKE_PROBES) {
    const result = resultById.get(requiredProbe);

    if (!result) {
      continue;
    }

    const expectedOrigin =
      requiredProbe === 'tanstack-root'
        ? tanstackOrigin.origin
        : backendOrigin.origin;

    if (!expectedOrigin) {
      continue;
    }

    const urlFailure = validateCloudflareSmokeUrlMatchesOrigin(
      result.url,
      expectedOrigin,
      `${requiredProbe} smoke probe`
    );

    if (urlFailure) {
      failures.push(urlFailure);
    }
  }

  return failures;
}

function checkE2EGate({
  e2eReportPath,
  evidenceMaxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
  evidenceNowMs,
  fsImpl = fs,
  requireE2E = true,
} = {}) {
  if (!e2eReportPath) {
    return {
      gate: gate(
        'docker-e2e-compare',
        'Docker E2E compare',
        !requireE2E,
        requireE2E
          ? 'No Docker E2E compare report was provided.'
          : 'Docker E2E compare report was not required for this run.'
      ),
      report: null,
    };
  }

  const report = readJson(e2eReportPath, fsImpl);
  const validation = validateE2EReport(report);
  const failures = [
    ...validation.failures,
    ...validateEvidenceFreshness(report, 'Docker E2E compare', {
      maxAgeMs: evidenceMaxAgeMs,
      nowMs: evidenceNowMs,
    }),
  ];

  return {
    gate: gate(
      'docker-e2e-compare',
      'Docker E2E compare',
      failures.length === 0,
      failures.length === 0
        ? 'Docker E2E compare report passed for next and tanstack frontends.'
        : failures.join('\n')
    ),
    report: {
      frontend: report.frontend,
      generatedAt: report.generatedAt,
      origins: validation.origins,
      status: report.status,
    },
  };
}

function validateCloudflareSmokeReport(report) {
  const failures = [];
  const results = Array.isArray(report.results) ? report.results : [];
  const resultById = new Map(
    results
      .filter((result) => typeof result?.id === 'string')
      .map((result) => [result.id, result])
  );

  if (report.ok !== true) {
    failures.push('Cloudflare smoke report did not pass.');
  }

  failures.push(...validateCloudflareSmokeProvenance(report, resultById));

  for (const requiredProbe of REQUIRED_CLOUDFLARE_SMOKE_PROBES) {
    const result = resultById.get(requiredProbe);

    if (!result) {
      failures.push(`Cloudflare smoke report is missing ${requiredProbe}.`);
      continue;
    }

    if (result.ok !== true) {
      failures.push(
        `${requiredProbe} smoke probe failed: ${result.detail ?? 'no detail'}.`
      );
    }

    const status = Number(result.status);
    const expectedStatus = Number(result.expectedStatus);
    const statusMatchesExpectation = Number.isFinite(expectedStatus)
      ? status === expectedStatus
      : status >= 200 && status < 400;

    if (!Number.isFinite(status) || !statusMatchesExpectation) {
      failures.push(
        Number.isFinite(expectedStatus)
          ? `${requiredProbe} smoke probe returned status ${
              result.status ?? 'missing'
            }; expected ${expectedStatus}.`
          : `${requiredProbe} smoke probe returned status ${
              result.status ?? 'missing'
            }.`
      );
    }
  }

  return {
    failures,
    ok: failures.length === 0,
  };
}

function checkCloudflareSmokeGate({
  cloudflareSmokeReportPath,
  evidenceMaxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
  evidenceNowMs,
  fsImpl = fs,
  requireCloudflareSmoke = true,
} = {}) {
  if (!cloudflareSmokeReportPath) {
    return {
      gate: gate(
        'cloudflare-smoke',
        'Cloudflare smoke',
        !requireCloudflareSmoke,
        requireCloudflareSmoke
          ? 'No Cloudflare smoke report was provided.'
          : 'Cloudflare smoke report was not required for this run.'
      ),
      report: null,
    };
  }

  const report = readJson(cloudflareSmokeReportPath, fsImpl);
  const validation = validateCloudflareSmokeReport(report);
  const failures = [
    ...validation.failures,
    ...validateEvidenceFreshness(report, 'Cloudflare smoke', {
      maxAgeMs: evidenceMaxAgeMs,
      nowMs: evidenceNowMs,
    }),
  ];

  return {
    gate: gate(
      'cloudflare-smoke',
      'Cloudflare smoke',
      failures.length === 0,
      failures.length === 0
        ? 'Cloudflare smoke report passed for Rust backend and TanStack Workers.'
        : failures.join('\n')
    ),
    report: {
      generatedAt: report.generatedAt,
      ok: report.ok,
      probes: Array.isArray(report.results)
        ? report.results.map((result) => result.id).filter(Boolean)
        : [],
    },
  };
}

function getDiagnosticEvidenceSkips({
  requireBenchmark = true,
  requireCloudflareSmoke = true,
  requireE2E = true,
} = {}) {
  return [
    requireBenchmark ? null : '--skip-benchmark',
    requireE2E ? null : '--skip-e2e',
    requireCloudflareSmoke ? null : '--skip-cloudflare-smoke',
  ].filter(Boolean);
}

function checkDiagnosticSkipGate(options = {}) {
  const skips = getDiagnosticEvidenceSkips(options);
  const ok = !options.requireMigrated || skips.length === 0;

  return gate(
    'diagnostic-evidence-skips',
    'Diagnostic evidence skips',
    ok,
    skips.length === 0
      ? 'No diagnostic evidence skips requested.'
      : ok
        ? `Diagnostic evidence skips are allowed with --allow-legacy: ${skips.join(
            ', '
          )}.`
        : `Diagnostic evidence skips are not allowed for terminal cutover; rerun without ${skips.join(
            ', '
          )} or pass --allow-legacy for a non-terminal diagnostic run.`
  );
}

function runCutoverGates(options = {}) {
  const manifest = checkManifestGates(options);
  const benchmark = checkBenchmarkGate(options);
  const e2e = checkE2EGate(options);
  const cloudflareSmoke = checkCloudflareSmokeGate(options);
  const diagnosticSkips = checkDiagnosticSkipGate(options);
  const gates = [
    ...manifest.gates,
    diagnosticSkips,
    benchmark.gate,
    e2e.gate,
    cloudflareSmoke.gate,
  ];

  return {
    benchmark: benchmark.report,
    cloudflareSmoke: cloudflareSmoke.report,
    e2e: e2e.report,
    generatedAt: new Date().toISOString(),
    gates,
    manifest: {
      counts: manifest.counts,
      summary: manifest.summary,
    },
    ok: gates.every((item) => item.ok),
  };
}

function writeOutput(result, outputPath, fsImpl = fs) {
  if (!outputPath) {
    return;
  }

  fsImpl.mkdirSync(path.dirname(outputPath), { recursive: true });
  fsImpl.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

function printHelp() {
  console.log(`Usage: bun migration:tanstack:gates -- [options]

Options:
  --manifest <path>
  --overrides <path>
  --app-dir <path>
  --benchmark-report <path>
  --benchmark-profile <profile>   default: full
  --benchmark-setup <setup>       default: compare
  --e2e-report <path>
  --cloudflare-smoke-report <path>
  --evidence-max-age-ms <ms>      default: ${DEFAULT_EVIDENCE_MAX_AGE_MS}
  --output <path>
  --allow-legacy
  --skip-benchmark
  --skip-cloudflare-smoke
  --skip-e2e
`);
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const result = runCutoverGates(options);
  writeOutput(result, options.outputPath);

  if (!result.ok) {
    console.error(
      result.gates
        .filter((item) => !item.ok)
        .map((item) => `${item.label}: ${item.detail}`)
        .join('\n\n')
    );
    return 1;
  }

  console.log('TanStack/Rust cutover gates passed.');
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  checkBenchmarkGate,
  checkCloudflareSmokeGate,
  checkE2EGate,
  checkManifestGates,
  countManifestRoutes,
  parseArgs,
  runCutoverGates,
  validateBenchmarkReport,
  validateCloudflareSmokeReport,
  validateE2EReport,
};
