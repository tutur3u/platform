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
const DEFAULT_TIMEOUT_MS = 10_000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOrigin(value, name) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }

  const normalized = /^[a-z]+:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(normalized).origin;
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin.`);
  }
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    backendOrigin: env.BACKEND_WORKER_ORIGIN,
    help: false,
    outputPath: env.CLOUDFLARE_SMOKE_REPORT_PATH ?? null,
    tanstackOrigin: env.TANSTACK_WEB_WORKER_ORIGIN,
    timeoutMs: parsePositiveInteger(
      env.CLOUDFLARE_SMOKE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    token: env.BACKEND_INTERNAL_TOKEN,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--backend-origin') {
      args.backendOrigin = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--tanstack-origin') {
      args.tanstackOrigin = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--token') {
      args.token = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      args.timeoutMs = parsePositiveInteger(argv[index + 1], args.timeoutMs);
      index += 1;
      continue;
    }

    if (arg === '--output') {
      args.outputPath = argv[index + 1];
      index += 1;
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

  if (args.help) {
    return args;
  }

  args.backendOrigin = normalizeOrigin(
    args.backendOrigin,
    'BACKEND_WORKER_ORIGIN'
  );
  args.tanstackOrigin = normalizeOrigin(
    args.tanstackOrigin,
    'TANSTACK_WEB_WORKER_ORIGIN'
  );

  if (!String(args.token ?? '').trim()) {
    throw new Error('BACKEND_INTERNAL_TOKEN is required.');
  }

  return args;
}

function createSmokePlan({ backendOrigin, tanstackOrigin, token }) {
  return [
    {
      id: 'backend-health',
      label: 'Rust backend health',
      origin: backendOrigin,
      path: '/healthz',
    },
    {
      id: 'backend-ready',
      label: 'Rust backend readiness',
      origin: backendOrigin,
      path: '/readyz',
    },
    {
      headers: {
        authorization: `Bearer ${token}`,
      },
      id: 'backend-migration-status',
      jsonCheck: (payload) =>
        payload?.backend?.runtime === 'rust' &&
        typeof payload?.backend?.deploymentTarget === 'string',
      label: 'Rust migration status',
      origin: backendOrigin,
      path: '/api/migration/status',
    },
    {
      bodyIncludes: ['TanStack Start + Rust readiness', 'Backend reachable'],
      id: 'tanstack-root',
      label: 'TanStack Start root',
      origin: tanstackOrigin,
      path: '/',
    },
  ];
}

function createSmokeProvenance(
  { backendOrigin, tanstackOrigin, timeoutMs },
  probes
) {
  return {
    backendOrigin,
    probeIds: probes.map((probe) => probe.id),
    reporter: 'scripts/smoke-cloudflare-workers.js',
    tanstackOrigin,
    timeoutMs,
  };
}

function isSuccessfulStatus(status) {
  return status >= 200 && status < 400;
}

function getExpectedBodySnippets(bodyIncludes) {
  if (!bodyIncludes) {
    return [];
  }

  return Array.isArray(bodyIncludes) ? bodyIncludes : [bodyIncludes];
}

function getFailureDetail({ bodyIncludes, jsonCheck, payload, responseText }) {
  const missingSnippet = getExpectedBodySnippets(bodyIncludes).find(
    (expectedSnippet) => !responseText.includes(expectedSnippet)
  );

  if (missingSnippet) {
    return `response body did not include ${JSON.stringify(missingSnippet)}`;
  }

  if (jsonCheck && !jsonCheck(payload)) {
    return 'JSON response did not match the expected migration status shape';
  }

  return null;
}

async function runProbe(probe, { fetchImpl = fetch, timeoutMs }) {
  const startedAt = performance.now();
  const url = new URL(probe.path, probe.origin).toString();

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: probe.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const successfulStatus = isSuccessfulStatus(response.status);
    const responseText =
      successfulStatus && (probe.bodyIncludes || probe.jsonCheck)
        ? await response.text()
        : '';
    const payload =
      successfulStatus && probe.jsonCheck && responseText
        ? JSON.parse(responseText)
        : null;
    const failureDetail = successfulStatus
      ? getFailureDetail({
          bodyIncludes: probe.bodyIncludes,
          jsonCheck: probe.jsonCheck,
          payload,
          responseText,
        })
      : `HTTP ${response.status}`;

    return {
      detail: failureDetail,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      id: probe.id,
      label: probe.label,
      ok: successfulStatus && !failureDetail,
      status: response.status,
      url,
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      id: probe.id,
      label: probe.label,
      ok: false,
      url,
    };
  }
}

async function runSmoke(options, fetchImpl = fetch) {
  const probes = createSmokePlan(options);
  const results = [];

  for (const probe of probes) {
    results.push(
      await runProbe(probe, {
        fetchImpl,
        timeoutMs: options.timeoutMs,
      })
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    ok: results.every((result) => result.ok),
    provenance: createSmokeProvenance(options, probes),
    results,
  };
}

function formatResult(result) {
  const status = result.status ? `status=${result.status}` : 'status=error';
  const detail = result.detail ? ` ${result.detail}` : '';
  const prefix = result.ok ? 'PASS' : 'FAIL';

  return `${prefix} ${result.label} ${status} durationMs=${result.durationMs}${detail}`;
}

function isInsideDirectory(candidatePath, parentPath) {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function writeSmokeReport(report, outputPath, fsImpl = fs) {
  if (!outputPath) {
    return null;
  }

  const resolvedOutputPath = path.resolve(outputPath);

  if (!isInsideDirectory(resolvedOutputPath, DEFAULT_OUTPUT_DIR)) {
    throw new Error(
      `Cloudflare smoke reports must be written under ${path.relative(
        ROOT_DIR,
        DEFAULT_OUTPUT_DIR
      )}; got ${path.relative(ROOT_DIR, resolvedOutputPath)}.`
    );
  }

  fsImpl.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fsImpl.writeFileSync(
    resolvedOutputPath,
    `${JSON.stringify(report, null, 2)}\n`
  );

  return resolvedOutputPath;
}

function printHelp() {
  console.log(`Usage: bun smoke:cloudflare [options]

Required inputs, via environment or flags:
  BACKEND_WORKER_ORIGIN / --backend-origin <origin>
  TANSTACK_WEB_WORKER_ORIGIN / --tanstack-origin <origin>
  BACKEND_INTERNAL_TOKEN / --token <token>

Options:
  --output <path>
  --timeout-ms <milliseconds>
  --insecure
`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const report = await runSmoke(options);
  const reportPath = writeSmokeReport(report, options.outputPath);

  for (const result of report.results) {
    console.log(formatResult(result));
  }

  if (reportPath) {
    console.log(
      `Cloudflare smoke report written to ${path.relative(ROOT_DIR, reportPath)}`
    );
  }

  return report.ok ? 0 : 1;
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
  createSmokePlan,
  createSmokeProvenance,
  formatResult,
  isSuccessfulStatus,
  normalizeOrigin,
  parseArgs,
  runProbe,
  runSmoke,
  writeSmokeReport,
};
