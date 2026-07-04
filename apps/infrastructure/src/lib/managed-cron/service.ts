import 'server-only';

import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { listEnabledManagedCronDomains } from './domain-repository';
import {
  closeManagedCronDispatcher,
  type ManagedCronFetch,
  type ManagedCronNetworkDependencies,
  type ResolvedManagedCronNetworkDependencies,
  resolveManagedCronNetwork,
  resolveSafeManagedCronAddress,
} from './network';
import { callManagedCronRpc, ensureRpcArray } from './rpc';
import {
  collectManagedCronHeaderSecretNames,
  getNextManagedCronRunAt,
  MANAGED_CRON_MAX_RESPONSE_CHARS,
  type ManagedCronHeaderConfig,
  type ManagedCronHttpMethod,
  resolveManagedCronRequestHeaders,
  validateManagedCronEndpointUrl,
} from './validation';

const CLAIM_LIMIT = 25;
const LOCK_TTL_SECONDS = 10 * 60;
const RETRY_DELAY_MS = 250;

interface ManagedCronJobRow {
  active: boolean;
  endpoint_url: string;
  headers_config: ManagedCronHeaderConfig[];
  http_method: ManagedCronHttpMethod;
  id: string;
  name: string;
  retry_count: number;
  schedule: string;
  schedule_timezone: string;
  timeout_ms: number;
  ws_id: string;
}

interface ManagedCronExecutionResult {
  durationMs: number;
  endTime: Date;
  error: string | null;
  httpStatus: number | null;
  response: string | null;
  startTime: Date;
  status: 'configuration_error' | 'failed' | 'success' | 'timeout';
  url: string;
}

export interface ManagedCronProcessSummary {
  claimed: number;
  configurationErrors: number;
  failed: number;
  succeeded: number;
  timedOut: number;
}

export interface ManagedCronRunNowResult {
  durationMs: number;
  error: string | null;
  httpStatus: number | null;
  jobId: string;
  response: string | null;
  status: 'configuration_error' | 'failed' | 'success' | 'timeout';
}

export async function processDueManagedCronJobs({
  fetchImpl,
  limit = CLAIM_LIMIT,
  network,
  runnerId = `apps-web-${crypto.randomUUID()}`,
}: {
  fetchImpl?: ManagedCronFetch;
  limit?: number;
  network?: ManagedCronNetworkDependencies;
  runnerId?: string;
} = {}): Promise<ManagedCronProcessSummary> {
  const requestNetwork = resolveManagedCronNetwork({
    ...network,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const [allowedDomains, jobs] = await Promise.all([
    listEnabledManagedCronDomains(),
    claimDueManagedCronJobs({ limit, runnerId }),
  ]);

  const summary: ManagedCronProcessSummary = {
    claimed: jobs.length,
    configurationErrors: 0,
    failed: 0,
    succeeded: 0,
    timedOut: 0,
  };

  for (const job of jobs) {
    const result = await executeManagedCronJob({
      allowedDomains,
      job,
      network: requestNetwork,
    });

    await recordManagedCronExecution({ job, result, runnerId });

    if (result.status === 'success') summary.succeeded += 1;
    if (result.status === 'failed') summary.failed += 1;
    if (result.status === 'timeout') summary.timedOut += 1;
    if (result.status === 'configuration_error') {
      summary.configurationErrors += 1;
    }
  }

  return summary;
}

export async function runExternalManagedCronJobNow({
  externalAppId,
  fetchImpl,
  jobKey,
  network,
  runnerId = `external-app-${externalAppId}-${crypto.randomUUID()}`,
  wsId,
}: {
  externalAppId: string;
  fetchImpl?: ManagedCronFetch;
  jobKey: string;
  network?: ManagedCronNetworkDependencies;
  runnerId?: string;
  wsId: string;
}): Promise<ManagedCronRunNowResult | null> {
  const requestNetwork = resolveManagedCronNetwork({
    ...network,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const rows = await callManagedCronRpc<
    Array<
      Omit<ManagedCronJobRow, 'headers_config'> & {
        headers_config: ManagedCronHeaderConfig[] | string | null;
      }
    >
  >('managed_cron_claim_external_job', {
    p_external_app_id: externalAppId,
    p_external_job_key: jobKey,
    p_runner_id: runnerId,
    p_ws_id: wsId,
  });
  const row = rows[0];

  if (!row) return null;

  const job: ManagedCronJobRow = {
    ...row,
    headers_config: parseHeaderConfig(row.headers_config),
  };
  const allowedDomains = await listEnabledManagedCronDomains();
  const result = await executeManagedCronJob({
    allowedDomains,
    job,
    network: requestNetwork,
  });

  await recordManagedCronExecution({
    job,
    result,
    runnerId,
    source: 'manual',
  });

  return {
    durationMs: result.durationMs,
    error: result.error,
    httpStatus: result.httpStatus,
    jobId: job.id,
    response: result.response,
    status: result.status,
  };
}

async function claimDueManagedCronJobs({
  limit,
  runnerId,
}: {
  limit: number;
  runnerId: string;
}) {
  const rows = await callManagedCronRpc<
    Array<
      Omit<ManagedCronJobRow, 'headers_config'> & {
        headers_config: ManagedCronHeaderConfig[] | string | null;
      }
    >
  >('managed_cron_claim_due_jobs', {
    p_limit: limit,
    p_lock_ttl_seconds: LOCK_TTL_SECONDS,
    p_runner_id: runnerId,
  });

  return ensureRpcArray<
    Omit<ManagedCronJobRow, 'headers_config'> & {
      headers_config: ManagedCronHeaderConfig[] | string | null;
    }
  >(rows).map(
    (row): ManagedCronJobRow => ({
      ...row,
      headers_config: parseHeaderConfig(row.headers_config),
    })
  );
}

async function executeManagedCronJob({
  allowedDomains,
  job,
  network,
}: {
  allowedDomains: string[];
  job: ManagedCronJobRow;
  network: ResolvedManagedCronNetworkDependencies;
}): Promise<ManagedCronExecutionResult> {
  const startTime = new Date();
  const validation = validateManagedCronEndpointUrl(
    job.endpoint_url,
    allowedDomains
  );

  if (!validation.ok || !validation.url) {
    return buildConfigurationError({
      message: validation.message ?? 'Managed cron endpoint is invalid.',
      startTime,
      url: job.endpoint_url,
    });
  }

  let headers: Headers;
  try {
    const secretNames = collectManagedCronHeaderSecretNames(job.headers_config);
    const secrets = await loadWorkspaceSecretValues({
      secretNames,
      wsId: job.ws_id,
    });
    headers = resolveManagedCronRequestHeaders({
      config: job.headers_config,
      secrets,
    });
  } catch (error) {
    return buildConfigurationError({
      message: error instanceof Error ? error.message : String(error),
      startTime,
      url: validation.url,
    });
  }

  let lastError: unknown = null;
  const maxAttempts = job.retry_count + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), job.timeout_ms);

    try {
      const requestUrl = new URL(validation.url);
      const address = await resolveSafeManagedCronAddress(
        requestUrl,
        network.resolveHost
      );
      const dispatcher = network.createDispatcher(address);
      let response: Response;
      let text: string;

      try {
        response = await network.fetchImpl(requestUrl, {
          cache: 'no-store',
          dispatcher,
          headers,
          method: job.http_method,
          redirect: 'manual',
          signal: abortController.signal,
        });
        text = await response.text();
      } finally {
        await closeManagedCronDispatcher(dispatcher);
      }

      if (response.ok || attempt === maxAttempts) {
        const endTime = new Date();
        return {
          durationMs: endTime.getTime() - startTime.getTime(),
          endTime,
          error: response.ok ? null : `HTTP ${response.status}`,
          httpStatus: response.status,
          response: text.slice(0, MANAGED_CRON_MAX_RESPONSE_CHARS),
          startTime,
          status: response.ok ? 'success' : 'failed',
          url: validation.url,
        };
      }
    } catch (error) {
      lastError = error;
      const isTimeout = isAbortError(error);
      if (attempt === maxAttempts) {
        const endTime = new Date();
        return {
          durationMs: endTime.getTime() - startTime.getTime(),
          endTime,
          error: error instanceof Error ? error.message : String(error),
          httpStatus: null,
          response: null,
          startTime,
          status: isTimeout ? 'timeout' : 'failed',
          url: validation.url,
        };
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(RETRY_DELAY_MS);
  }

  const endTime = new Date();
  return {
    durationMs: endTime.getTime() - startTime.getTime(),
    endTime,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    httpStatus: null,
    response: null,
    startTime,
    status: 'failed',
    url: validation.url,
  };
}

async function recordManagedCronExecution({
  job,
  result,
  runnerId,
  source = 'scheduled',
}: {
  job: ManagedCronJobRow;
  result: ManagedCronExecutionResult;
  runnerId: string;
  source?: 'manual' | 'scheduled';
}) {
  const nextRunAt = getNextManagedCronRunAt(
    job.schedule,
    result.endTime,
    job.schedule_timezone
  );
  const response =
    result.response?.slice(0, MANAGED_CRON_MAX_RESPONSE_CHARS) ?? null;
  const error = result.error?.slice(0, 2000) ?? null;

  await callManagedCronRpc('managed_cron_record_execution', {
    p_duration_ms: Math.max(0, result.durationMs),
    p_end_time: result.endTime.toISOString(),
    p_endpoint_url: result.url,
    p_error: error,
    p_http_status: result.httpStatus,
    p_job_id: job.id,
    p_next_run_at: nextRunAt.toISOString(),
    p_response: response,
    p_runner_id: runnerId,
    p_source: source,
    p_start_time: result.startTime.toISOString(),
    p_status: result.status,
  });
}

async function loadWorkspaceSecretValues({
  secretNames,
  wsId,
}: {
  secretNames: string[];
  wsId: string;
}) {
  const values = new Map<string, string>();
  if (secretNames.length === 0) return values;

  const rows = await callManagedCronRpc<Array<{ name: string; value: string }>>(
    'managed_cron_load_secret_values',
    {
      p_secret_names: secretNames,
      p_ws_id: wsId,
    }
  );

  for (const row of ensureRpcArray<{ name: string; value: string }>(rows)) {
    values.set(row.name, row.value);
  }

  return values;
}

function buildConfigurationError({
  message,
  startTime,
  url,
}: {
  message: string;
  startTime: Date;
  url: string;
}): ManagedCronExecutionResult {
  const endTime = new Date();
  return {
    durationMs: endTime.getTime() - startTime.getTime(),
    endTime,
    error: message,
    httpStatus: null,
    response: null,
    startTime,
    status: 'configuration_error',
    url,
  };
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /aborted|abort/iu.test(error.message))
  );
}

function parseHeaderConfig(
  value: ManagedCronHeaderConfig[] | string | null
): ManagedCronHeaderConfig[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as ManagedCronHeaderConfig[]) : [];
  } catch {
    return [];
  }
}
