#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_RUNTIME_ROOT = path.join(ROOT_DIR, 'tmp', 'docker-web');
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {
    intervalMs: DEFAULT_INTERVAL_MS,
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--once') {
      parsed.once = true;
      continue;
    }
    if (arg === '--interval-ms') {
      parsed.intervalMs = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.intervalMs) || parsed.intervalMs <= 0) {
    throw new Error('--interval-ms must be a positive integer.');
  }

  return parsed;
}

function getStressTestingPaths({
  controlDir = process.env.PLATFORM_STRESS_TEST_CONTROL_DIR ||
    path.join(DEFAULT_RUNTIME_ROOT, 'watch', 'control', 'stress-tests'),
  runtimeDir = process.env.PLATFORM_STRESS_TEST_MONITORING_DIR ||
    path.join(DEFAULT_RUNTIME_ROOT, 'stress-tests'),
} = {}) {
  return {
    abortRequestsDir: path.join(controlDir, 'abort-requests'),
    runRequestsDir: path.join(controlDir, 'run-requests'),
    runsDir: path.join(runtimeDir, 'runs'),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendJsonLine(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function getNextRequest(paths) {
  if (!fs.existsSync(paths.runRequestsDir)) return null;
  const fileName = fs
    .readdirSync(paths.runRequestsDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()[0];
  if (!fileName) return null;

  const filePath = path.join(paths.runRequestsDir, fileName);
  const request = readJsonFile(filePath, null);
  if (!request?.run?.id || request.kind !== 'stress-test-run') {
    fs.unlinkSync(filePath);
    return null;
  }

  return { filePath, request };
}

function getRunDir(paths, runId) {
  return path.join(paths.runsDir, runId);
}

function percentile(values, percent) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? null;
}

function createResourceSampler() {
  let previousCpu = process.cpuUsage();
  let previousAt = Date.now();
  const cpuCount = Math.max(1, os.cpus().length);

  return () => {
    const now = Date.now();
    const currentCpu = process.cpuUsage();
    const elapsedMicros = Math.max(1, (now - previousAt) * 1000);
    const cpuMicros =
      currentCpu.user -
      previousCpu.user +
      currentCpu.system -
      previousCpu.system;
    previousCpu = currentCpu;
    previousAt = now;

    return {
      cpuPercent: Math.min(100, (cpuMicros / elapsedMicros / cpuCount) * 100),
      memoryBytes: process.memoryUsage().rss,
      rxBytes: null,
      txBytes: null,
    };
  };
}

function getAbortRequest(paths, runId) {
  return readJsonFile(path.join(paths.abortRequestsDir, `${runId}.json`), null);
}

async function sendOneRequest(
  url,
  runId,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': `tuturuuu-stress-test/${runId}`,
        'X-Tuturuuu-Stress-Test-Run': runId,
      },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      durationMs: Date.now() - startedAt,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Request failed',
      ok: false,
      status: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runBatch({ run, targetRequests }) {
  const queue = Array.from({ length: targetRequests });
  const results = [];
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(run.profile.concurrency, targetRequests) },
    async () => {
      while (cursor < queue.length) {
        cursor += 1;
        results.push(await sendOneRequest(run.target.url, run.id));
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function createSample({ elapsedSeconds, resource, results, run }) {
  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => !result.ok).length;
  const statusCodes = {};
  for (const result of results) {
    const key = String(result.status || 'error');
    statusCodes[key] = (statusCodes[key] ?? 0) + 1;
  }

  return {
    activeRequests: 0,
    cpuPercent: resource.cpuPercent,
    errorRate: results.length > 0 ? failures / results.length : 0,
    latencyP50Ms: percentile(durations, 50),
    latencyP95Ms: percentile(durations, 95),
    latencyP99Ms: percentile(durations, 99),
    memoryBytes: resource.memoryBytes,
    requestsPerSecond: results.length,
    rxBytes: resource.rxBytes,
    sampledAt: Date.now(),
    statusCodes,
    txBytes: resource.txBytes,
    virtualUsers: Math.min(
      run.profile.concurrency,
      Math.ceil(
        run.profile.concurrency *
          Math.min(1, elapsedSeconds / Math.max(1, run.profile.rampSeconds))
      )
    ),
  };
}

function summarize(samples, status) {
  const totalRequests = samples.reduce(
    (total, sample) => total + sample.requestsPerSecond,
    0
  );
  const averageRequestsPerSecond =
    samples.length > 0 ? totalRequests / samples.length : null;
  const peakRequestsPerSecond =
    samples.length > 0
      ? Math.max(...samples.map((sample) => sample.requestsPerSecond))
      : null;
  const errorRate =
    samples.length > 0
      ? samples.reduce((total, sample) => total + (sample.errorRate ?? 0), 0) /
        samples.length
      : null;
  const latest = samples.at(-1);
  const failureMode =
    status === 'failed'
      ? 'Runner failed before completing the requested profile.'
      : errorRate != null && errorRate > 0.05
        ? 'Error rate exceeded 5% during the run.'
        : null;

  return {
    averageRequestsPerSecond,
    capacityJudgement:
      status === 'completed' && (errorRate ?? 0) <= 0.01
        ? 'Stable under the tested load profile.'
        : status === 'completed'
          ? 'Completed with elevated errors; review saturation signals.'
          : null,
    errorRate,
    estimatedSteadyUsers: latest?.virtualUsers ?? null,
    failureMode,
    latency: {
      p50Ms: latest?.latencyP50Ms ?? null,
      p95Ms: latest?.latencyP95Ms ?? null,
      p99Ms: latest?.latencyP99Ms ?? null,
    },
    peakRequestsPerSecond,
    safeRequestsPerSecond:
      errorRate != null && errorRate <= 0.01 && peakRequestsPerSecond != null
        ? Math.floor(peakRequestsPerSecond * 0.8)
        : null,
    saturationPoint: failureMode,
    totalRequests,
  };
}

async function executeRun(request, paths) {
  const run = {
    ...request.run,
    startedAt: Date.now(),
    status: 'running',
    updatedAt: Date.now(),
  };
  const runDir = getRunDir(paths, run.id);
  const statusFile = path.join(runDir, 'status.json');
  const resultFile = path.join(runDir, 'result.json');
  const samplesFile = path.join(runDir, 'samples.jsonl');
  const sampleResources = createResourceSampler();
  const samples = [];
  fs.rmSync(samplesFile, { force: true });
  writeJsonFile(statusFile, run);

  try {
    const startedAt = Date.now();
    const endsAt = startedAt + run.profile.durationSeconds * 1000;

    while (Date.now() < endsAt) {
      const abortRequest = getAbortRequest(paths, run.id);
      if (abortRequest) {
        run.status = 'aborted';
        run.abortReason = abortRequest.reason || 'Operator requested abort.';
        run.abortRequestedAt = abortRequest.requestedAt || Date.now();
        break;
      }

      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
      const rampRatio = Math.min(
        1,
        elapsedSeconds / Math.max(1, run.profile.rampSeconds)
      );
      const targetRequests = Math.max(
        1,
        Math.min(
          run.profile.maxRequestsPerSecond,
          Math.ceil(run.profile.maxRequestsPerSecond * rampRatio)
        )
      );
      const results = await runBatch({ run, targetRequests });
      const sample = createSample({
        elapsedSeconds,
        resource: sampleResources(),
        results,
        run,
      });
      samples.push(sample);
      appendJsonLine(samplesFile, sample);
      run.samples = samples;
      run.summary = summarize(samples, run.status);
      run.updatedAt = Date.now();
      writeJsonFile(statusFile, run);
    }

    if (run.status === 'running') run.status = 'completed';
  } catch (error) {
    run.status = 'failed';
    run.errorMessage = error instanceof Error ? error.message : 'Run failed';
  }

  run.endedAt = Date.now();
  run.summary = summarize(samples, run.status);
  run.updatedAt = run.endedAt;
  writeJsonFile(statusFile, run);
  writeJsonFile(resultFile, run);
  return run;
}

async function processOnce(paths = getStressTestingPaths()) {
  const next = getNextRequest(paths);
  if (!next) return null;

  fs.unlinkSync(next.filePath);
  return executeRun(next.request, paths);
}

async function main() {
  const args = parseArgs();
  const paths = getStressTestingPaths();
  ensureDir(paths.runRequestsDir);
  ensureDir(paths.abortRequestsDir);
  ensureDir(paths.runsDir);

  do {
    await processOnce(paths);
    if (!args.once) {
      await new Promise((resolve) => setTimeout(resolve, args.intervalMs));
    }
  } while (!args.once);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createSample,
  getStressTestingPaths,
  processOnce,
  summarize,
};
