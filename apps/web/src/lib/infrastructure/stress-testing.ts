import type {
  InfrastructureStressTestProfile,
  InfrastructureStressTestResourceSpike,
  InfrastructureStressTestRun,
  InfrastructureStressTestSample,
  InfrastructureStressTestSnapshot,
  InfrastructureStressTestStatus,
  InfrastructureStressTestSummary,
} from '@tuturuuu/internal-api/infrastructure';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  ensureLogDrainSchema,
  getLogDrainSqlClient,
  serverLogger,
} from './log-drain';
import {
  getDefaultStressTestSummary,
  summarizeStressTestSamples,
} from './stress-testing-analytics';
import {
  getRunTargetUrl,
  getStressTestTargets,
  normalizeStressTestRun,
  readRuntimeRun,
  readRuntimeRuns,
  STRESS_TEST_PROFILES,
  TERMINAL_STRESS_TEST_STATUSES,
  toStressTestDate,
  toStressTestMs,
} from './stress-testing-runtime';

export {
  createQueuedStressTestRun,
  getStressTestingPaths,
  queueStressTestAbortFile,
  queueStressTestRunFile,
} from './stress-testing-runtime';

type StressRunRow = {
  abort_reason: string | null;
  abort_requested_at: string | null;
  created_at: string;
  ended_at: string | null;
  error_message: string | null;
  id: string;
  profile: InfrastructureStressTestProfile;
  queued_at: string;
  requested_by: string | null;
  requested_by_email: string | null;
  resource_spikes: InfrastructureStressTestResourceSpike[];
  result_notes: string | null;
  started_at: string | null;
  status: InfrastructureStressTestStatus;
  summary: InfrastructureStressTestSummary;
  target_id: string;
  target_label: string;
  target_url: string;
  updated_at: string;
};

function rowToRun(row: StressRunRow): InfrastructureStressTestRun {
  const targetUrl = new URL(row.target_url);
  return normalizeStressTestRun({
    abortReason: row.abort_reason,
    abortRequestedAt: toStressTestMs(row.abort_requested_at),
    createdAt: toStressTestMs(row.created_at) ?? Date.now(),
    endedAt: toStressTestMs(row.ended_at),
    errorMessage: row.error_message,
    id: row.id,
    profile: row.profile,
    queuedAt: toStressTestMs(row.queued_at) ?? Date.now(),
    requestedBy: row.requested_by,
    requestedByEmail: row.requested_by_email,
    resourceSpikes: row.resource_spikes ?? [],
    resultNotes: row.result_notes,
    samples: [],
    startedAt: toStressTestMs(row.started_at),
    status: row.status,
    summary: row.summary ?? getDefaultStressTestSummary(),
    target: {
      baseUrl: targetUrl.origin,
      defaultPath: targetUrl.pathname,
      description: null,
      id: row.target_id,
      label: row.target_label,
    },
    updatedAt: toStressTestMs(row.updated_at) ?? Date.now(),
  })!;
}

async function getPrivateStressTable(table: string) {
  const admin = await createAdminClient();
  const privateSchema = admin.schema('private') as unknown as {
    from: (tableName: string) => any;
  };
  return privateSchema.from(table);
}

export async function persistStressTestRun(run: InfrastructureStressTestRun) {
  try {
    const table = await getPrivateStressTable(
      'infrastructure_stress_test_runs'
    );
    await table.upsert({
      abort_reason: run.abortReason,
      abort_requested_at: toStressTestDate(run.abortRequestedAt),
      created_at: toStressTestDate(run.createdAt),
      ended_at: toStressTestDate(run.endedAt),
      error_message: run.errorMessage,
      id: run.id,
      profile: run.profile,
      profile_id: run.profile.id,
      queued_at: toStressTestDate(run.queuedAt),
      requested_by: run.requestedBy,
      requested_by_email: run.requestedByEmail,
      resource_spikes: run.resourceSpikes,
      result_notes: run.resultNotes,
      started_at: toStressTestDate(run.startedAt),
      status: run.status,
      summary: run.summary,
      target_id: run.target.id,
      target_label: run.target.label,
      target_url: getRunTargetUrl(run.target),
      updated_at: toStressTestDate(run.updatedAt),
    });
  } catch (error) {
    serverLogger.warn('Failed to persist stress-test run', {
      error,
      runId: run.id,
    });
  }
}

async function readPersistedRuns(limit = 25) {
  try {
    const table = await getPrivateStressTable(
      'infrastructure_stress_test_runs'
    );
    const { data, error } = await table
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => rowToRun(row as StressRunRow));
  } catch {
    return [];
  }
}

async function readPersistedRun(runId: string) {
  try {
    const table = await getPrivateStressTable(
      'infrastructure_stress_test_runs'
    );
    const { data, error } = await table
      .select('*')
      .eq('id', runId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToRun(data as StressRunRow);
  } catch {
    return null;
  }
}

async function persistSamples(run: InfrastructureStressTestRun) {
  if (
    run.samples.length === 0 ||
    !TERMINAL_STRESS_TEST_STATUSES.has(run.status)
  ) {
    return;
  }

  try {
    const table = await getPrivateStressTable(
      'infrastructure_stress_test_samples'
    );
    await table.upsert(
      run.samples.map((sample) => ({
        active_requests: sample.activeRequests,
        cpu_percent: sample.cpuPercent,
        error_rate: sample.errorRate,
        latency_p50_ms: sample.latencyP50Ms,
        latency_p95_ms: sample.latencyP95Ms,
        latency_p99_ms: sample.latencyP99Ms,
        memory_bytes: sample.memoryBytes,
        requests_per_second: sample.requestsPerSecond,
        run_id: run.id,
        rx_bytes: sample.rxBytes,
        sampled_at: toStressTestDate(sample.sampledAt),
        status_codes: sample.statusCodes,
        tx_bytes: sample.txBytes,
        virtual_users: sample.virtualUsers,
      })),
      { onConflict: 'run_id,sampled_at' }
    );
  } catch (error) {
    serverLogger.warn('Failed to persist stress-test samples', {
      error,
      runId: run.id,
    });
  }
}

function getUsageRows(run: InfrastructureStressTestRun) {
  return run.samples.flatMap((sample: InfrastructureStressTestSample) => {
    const metadata = JSON.stringify({
      runId: run.id,
      statusCodes: sample.statusCodes,
      targetId: run.target.id,
    });
    const metrics: Array<{
      metric: string;
      unit: string;
      value: number | null;
    }> = [
      {
        metric: 'stress.cpu_percent',
        unit: 'percent',
        value: sample.cpuPercent,
      },
      {
        metric: 'stress.memory_bytes',
        unit: 'bytes',
        value: sample.memoryBytes,
      },
      { metric: 'stress.rx_bytes', unit: 'bytes', value: sample.rxBytes },
      { metric: 'stress.tx_bytes', unit: 'bytes', value: sample.txBytes },
    ];

    return metrics.flatMap(({ metric, unit, value }) =>
      value == null
        ? []
        : [{ metadata, metric, sample, unit, value: Number(value) }]
    );
  });
}

async function persistSamplesToLogDrain(run: InfrastructureStressTestRun) {
  if (
    run.samples.length === 0 ||
    !TERMINAL_STRESS_TEST_STATUSES.has(run.status)
  ) {
    return;
  }

  const sql = getLogDrainSqlClient();
  if (!sql) return;

  try {
    await ensureLogDrainSchema();
    const existing = await sql<Array<{ id: number }>>`
      SELECT id
      FROM usage_events
      WHERE metric = 'stress.cpu_percent'
        AND metadata->>'runId' = ${run.id}
      LIMIT 1
    `;
    if (existing.length > 0) return;

    for (const row of getUsageRows(run)) {
      await sql`
        INSERT INTO usage_events (
          project_id, source, metric, value, unit, route, metadata, created_at
        )
        VALUES (
          'platform', 'server', ${row.metric}, ${row.value},
          ${row.unit}, ${run.target.defaultPath}, ${row.metadata}::jsonb,
          ${new Date(row.sample.sampledAt)}
        )
      `;
    }
  } catch (error) {
    serverLogger.warn('Failed to persist stress-test usage samples', {
      error,
      runId: run.id,
    });
  }
}

async function syncRuntimeRun(run: InfrastructureStressTestRun) {
  const summary =
    run.summary.totalRequests > 0
      ? run.summary
      : summarizeStressTestSamples(run.samples, run.status);
  const normalizedRun = normalizeStressTestRun({ ...run, summary }) ?? run;
  await persistStressTestRun(normalizedRun);

  if (TERMINAL_STRESS_TEST_STATUSES.has(normalizedRun.status)) {
    await persistSamples(normalizedRun);
    await persistSamplesToLogDrain(normalizedRun);
  }

  return normalizedRun;
}

export async function readStressTestSnapshot({
  canManage,
}: {
  canManage: boolean;
}): Promise<InfrastructureStressTestSnapshot> {
  const [persistedRuns, runtimeRuns] = await Promise.all([
    readPersistedRuns(),
    Promise.resolve(readRuntimeRuns()),
  ]);
  const byId = new Map<string, InfrastructureStressTestRun>();

  for (const run of persistedRuns) byId.set(run.id, run);
  for (const run of runtimeRuns) {
    byId.set(run.id, {
      ...byId.get(run.id),
      ...(await syncRuntimeRun(run)),
      samples: run.samples,
    });
  }

  const recentRuns = [...byId.values()]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 25);
  const activeRun =
    recentRuns.find(
      (run) => run.status === 'running' || run.status === 'queued'
    ) ?? null;

  return {
    activeRun,
    canManage,
    profiles: STRESS_TEST_PROFILES,
    recentRuns,
    targets: getStressTestTargets(),
  };
}

export async function readStressTestRun(runId: string) {
  const runtime = readRuntimeRun(runId);
  const run = runtime
    ? normalizeStressTestRun(runtime)
    : await readPersistedRun(runId);

  return run ? syncRuntimeRun(run) : null;
}
