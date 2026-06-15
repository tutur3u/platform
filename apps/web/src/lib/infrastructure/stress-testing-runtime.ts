import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  InfrastructureStressTestProfile,
  InfrastructureStressTestRun,
  InfrastructureStressTestSample,
  InfrastructureStressTestStatus,
  InfrastructureStressTestTarget,
  QueueInfrastructureStressTestPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { serverLogger } from './log-drain';
import {
  computeStressTestResourceSpikes,
  summarizeStressTestSamples,
} from './stress-testing-analytics';

const STRESS_CONTROL_ENV_KEY = 'PLATFORM_STRESS_TEST_CONTROL_DIR';
const STRESS_RUNTIME_ENV_KEY = 'PLATFORM_STRESS_TEST_MONITORING_DIR';
const TARGETS_ENV_KEY = 'PLATFORM_STRESS_TEST_TARGETS';
const DEFAULT_RUNTIME_ROOT = path.join(process.cwd(), 'tmp', 'docker-web');

export const TERMINAL_STRESS_TEST_STATUSES =
  new Set<InfrastructureStressTestStatus>(['aborted', 'completed', 'failed']);

export const STRESS_TEST_PROFILES: InfrastructureStressTestProfile[] = [
  {
    concurrency: 5,
    durationSeconds: 30,
    id: 'smoke',
    label: 'Smoke',
    maxRequestsPerSecond: 10,
    rampSeconds: 5,
  },
  {
    concurrency: 50,
    durationSeconds: 300,
    id: 'steady',
    label: 'Steady',
    maxRequestsPerSecond: 100,
    rampSeconds: 60,
  },
  {
    concurrency: 120,
    durationSeconds: 180,
    id: 'spike',
    label: 'Spike',
    maxRequestsPerSecond: 250,
    rampSeconds: 15,
  },
  {
    concurrency: 200,
    durationSeconds: 600,
    id: 'ramp',
    label: 'Ramp',
    maxRequestsPerSecond: 400,
    rampSeconds: 240,
  },
];

function readJsonFile<T>(filePath: string, fallback: T, fsImpl = fs): T {
  if (!fsImpl.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function toStressTestMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toStressTestDate(value: number | null) {
  return value == null ? null : new Date(value).toISOString();
}

export function getStressTestingPaths() {
  const blueGreenRuntime =
    process.env.PLATFORM_BLUE_GREEN_MONITORING_DIR || DEFAULT_RUNTIME_ROOT;
  const blueGreenControl =
    process.env.PLATFORM_BLUE_GREEN_CONTROL_DIR ||
    path.join(DEFAULT_RUNTIME_ROOT, 'watch', 'control');
  const runtimeDir =
    process.env[STRESS_RUNTIME_ENV_KEY] ||
    path.join(blueGreenRuntime, 'stress-tests');
  const controlDir =
    process.env[STRESS_CONTROL_ENV_KEY] ||
    path.join(blueGreenControl, 'stress-tests');

  return {
    abortRequestsDir: path.join(controlDir, 'abort-requests'),
    controlDir,
    runRequestsDir: path.join(controlDir, 'run-requests'),
    runsDir: path.join(runtimeDir, 'runs'),
    runtimeDir,
  };
}

function normalizeTarget(
  value: unknown
): InfrastructureStressTestTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = String(record.id ?? '').trim();
  const label = String(record.label ?? id).trim();
  const baseUrl = String(record.baseUrl ?? '').trim();

  if (!id || !label || !baseUrl) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return {
      baseUrl: url.origin,
      defaultPath: String(record.defaultPath ?? '/').trim() || '/',
      description:
        typeof record.description === 'string' ? record.description : null,
      id,
      label,
    };
  } catch {
    return null;
  }
}

export function getStressTestTargets(): InfrastructureStressTestTarget[] {
  const configured = process.env[TARGETS_ENV_KEY]?.trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      const targets = Array.isArray(parsed)
        ? parsed.flatMap((target) => normalizeTarget(target) ?? [])
        : [];
      if (targets.length > 0) return targets;
    } catch {
      serverLogger.warn('Invalid stress-test target allowlist configuration');
    }
  }

  return [
    {
      baseUrl: 'http://127.0.0.1:7803',
      defaultPath: '/',
      description: 'Local web runtime on the native developer machine.',
      id: 'local-web',
      label: 'Local Web',
    },
  ];
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Math.min(
    max,
    Math.max(min, Number.isInteger(parsed) ? parsed : fallback)
  );
}

function normalizeProfile(
  payload: QueueInfrastructureStressTestPayload
): InfrastructureStressTestProfile {
  const base =
    STRESS_TEST_PROFILES.find((profile) => profile.id === payload.profileId) ??
    STRESS_TEST_PROFILES[0]!;

  return {
    ...base,
    concurrency: clampInt(payload.concurrency, base.concurrency, 1, 500),
    durationSeconds: clampInt(
      payload.durationSeconds,
      base.durationSeconds,
      5,
      1800
    ),
    maxRequestsPerSecond: clampInt(
      payload.maxRequestsPerSecond,
      base.maxRequestsPerSecond,
      1,
      1000
    ),
    rampSeconds: clampInt(payload.rampSeconds, base.rampSeconds, 0, 600),
  };
}

function resolveRunTarget(
  target: InfrastructureStressTestTarget,
  requestedPath: string | undefined
) {
  const baseUrl = new URL(target.baseUrl);
  const pathname = requestedPath?.trim() || target.defaultPath || '/';
  const candidatePath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(candidatePath, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error('Stress test target is not allowlisted.');
  }
  const normalizedPath = `${url.pathname}${url.search}${url.hash}`;

  return {
    ...target,
    defaultPath: normalizedPath,
    resolvedUrl: url.toString(),
  } as InfrastructureStressTestTarget & { resolvedUrl: string };
}

export function getRunTargetUrl(target: InfrastructureStressTestTarget) {
  const baseUrl = new URL(target.baseUrl);
  const resolvedUrl =
    (target as InfrastructureStressTestTarget & { resolvedUrl?: string })
      .resolvedUrl ?? new URL(target.defaultPath, baseUrl).toString();
  const url = new URL(resolvedUrl, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error('Stress test target is not allowlisted.');
  }
  return url.toString();
}

function getRunDir(runId: string, paths = getStressTestingPaths()) {
  return path.join(paths.runsDir, runId);
}

function readSamples(runId: string, paths = getStressTestingPaths()) {
  const samplesFile = path.join(getRunDir(runId, paths), 'samples.jsonl');
  if (!fs.existsSync(samplesFile)) return [];

  return fs
    .readFileSync(samplesFile, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as InfrastructureStressTestSample];
      } catch {
        return [];
      }
    });
}

export function readRuntimeRun(runId: string, paths = getStressTestingPaths()) {
  const runDir = getRunDir(runId, paths);
  const status = readJsonFile<Partial<InfrastructureStressTestRun> | null>(
    path.join(runDir, 'status.json'),
    null
  );
  const result = readJsonFile<Partial<InfrastructureStressTestRun> | null>(
    path.join(runDir, 'result.json'),
    null
  );

  if (!status && !result) return null;

  return {
    ...status,
    ...result,
    samples: readSamples(runId, paths),
  } as Partial<InfrastructureStressTestRun>;
}

export function normalizeStressTestRun(
  value: Partial<InfrastructureStressTestRun>
): InfrastructureStressTestRun | null {
  if (!value.id || !value.target || !value.profile) return null;
  const samples = value.samples ?? [];
  const status = value.status ?? 'queued';
  const summary =
    value.summary && value.summary.totalRequests > 0
      ? value.summary
      : summarizeStressTestSamples(samples, status);
  const resourceSpikes =
    value.resourceSpikes && value.resourceSpikes.length > 0
      ? value.resourceSpikes
      : computeStressTestResourceSpikes(
          samples,
          value.startedAt ?? null,
          value.endedAt ?? null
        );

  return {
    abortReason: value.abortReason ?? null,
    abortRequestedAt: value.abortRequestedAt ?? null,
    createdAt: value.createdAt ?? value.queuedAt ?? Date.now(),
    endedAt: value.endedAt ?? null,
    errorMessage: value.errorMessage ?? null,
    id: value.id,
    profile: value.profile,
    queuedAt: value.queuedAt ?? value.createdAt ?? Date.now(),
    requestedBy: value.requestedBy ?? null,
    requestedByEmail: value.requestedByEmail ?? null,
    resourceSpikes,
    resultNotes: value.resultNotes ?? null,
    samples,
    startedAt: value.startedAt ?? null,
    status,
    summary,
    target: value.target,
    updatedAt: value.updatedAt ?? value.endedAt ?? Date.now(),
  };
}

export function createQueuedStressTestRun({
  payload,
  requestedBy,
  requestedByEmail,
}: {
  payload: QueueInfrastructureStressTestPayload;
  requestedBy: string;
  requestedByEmail: string | null;
}) {
  const target = getStressTestTargets().find(
    (candidate) => candidate.id === payload.targetId
  );
  if (!target) throw new Error('Stress test target is not allowlisted.');

  const now = Date.now();
  return normalizeStressTestRun({
    createdAt: now,
    id: crypto.randomUUID(),
    profile: normalizeProfile(payload),
    queuedAt: now,
    requestedBy,
    requestedByEmail,
    samples: [],
    status: 'queued',
    target: resolveRunTarget(target, payload.path),
    updatedAt: now,
  })!;
}

export function queueStressTestRunFile(
  run: InfrastructureStressTestRun,
  paths = getStressTestingPaths()
) {
  const request = {
    id: run.id,
    kind: 'stress-test-run',
    requestedAt: run.queuedAt,
    run: {
      ...run,
      target: { ...run.target, url: getRunTargetUrl(run.target) },
    },
  };

  writeJsonFile(
    path.join(paths.runRequestsDir, `${run.queuedAt}-${run.id}.json`),
    request
  );
  return request;
}

export function queueStressTestAbortFile({
  reason,
  requestedBy,
  runId,
  paths = getStressTestingPaths(),
}: {
  reason: string | null;
  requestedBy: string;
  runId: string;
  paths?: ReturnType<typeof getStressTestingPaths>;
}) {
  const request = {
    id: crypto.randomUUID(),
    kind: 'stress-test-abort',
    reason,
    requestedAt: Date.now(),
    requestedBy,
    runId,
  };
  writeJsonFile(path.join(paths.abortRequestsDir, `${runId}.json`), request);
  return request;
}

export function readRuntimeRuns(paths = getStressTestingPaths()) {
  if (!fs.existsSync(paths.runsDir)) return [];
  return fs
    .readdirSync(paths.runsDir)
    .flatMap((entry) => {
      const run = readRuntimeRun(entry, paths);
      return run
        ? [normalizeStressTestRun(run)].flatMap((value) => value ?? [])
        : [];
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}
