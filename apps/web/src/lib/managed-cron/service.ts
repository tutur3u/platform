import 'server-only';

import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Sql } from 'postgres';
import { getPlatformSql } from '@/lib/database/platform-sql';
import { listEnabledManagedCronDomainsWithSql } from './domain-repository';
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
  fetchImpl = fetch,
  limit = CLAIM_LIMIT,
  runnerId = `apps-web-${crypto.randomUUID()}`,
  sql = getPlatformSql(),
}: {
  fetchImpl?: typeof fetch;
  limit?: number;
  runnerId?: string;
  sql?: Sql;
} = {}): Promise<ManagedCronProcessSummary> {
  const [allowedDomains, jobs] = await Promise.all([
    listEnabledManagedCronDomainsWithSql(sql),
    claimDueManagedCronJobs({ limit, runnerId, sql }),
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
      fetchImpl,
      job,
      sql,
    });

    await recordManagedCronExecution({ job, result, runnerId, sql });

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
  fetchImpl = fetch,
  jobKey,
  runnerId = `external-app-${externalAppId}-${crypto.randomUUID()}`,
  sql = getPlatformSql(),
  wsId,
}: {
  externalAppId: string;
  fetchImpl?: typeof fetch;
  jobKey: string;
  runnerId?: string;
  sql?: Sql;
  wsId: string;
}): Promise<ManagedCronRunNowResult | null> {
  const rows = await sql<
    Array<
      Omit<ManagedCronJobRow, 'headers_config'> & {
        headers_config: ManagedCronHeaderConfig[] | string | null;
      }
    >
  >`
    select
      j.id::text,
      j.ws_id::text,
      j.name,
      j.schedule,
      j.active,
      j.endpoint_url,
      j.http_method,
      j.headers_config,
      j.timeout_ms,
      j.retry_count
    from public.workspace_cron_jobs j
    where j.ws_id = ${wsId}
      and j.external_app_id = ${externalAppId}
      and j.external_job_key = ${jobKey}
    limit 1
  `;
  const row = rows[0];

  if (!row) return null;

  const job: ManagedCronJobRow = {
    ...row,
    headers_config: parseHeaderConfig(row.headers_config),
  };
  await sql`
    update public.workspace_cron_jobs
    set
      locked_at = now(),
      locked_by = ${runnerId}
    where id = ${job.id}
  `;
  const allowedDomains = await listEnabledManagedCronDomainsWithSql(sql);
  const result = await executeManagedCronJob({
    allowedDomains,
    fetchImpl,
    job,
    sql,
  });

  await recordManagedCronExecution({ job, result, runnerId, sql });

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
  sql,
}: {
  limit: number;
  runnerId: string;
  sql: Sql;
}) {
  const rows = await sql<
    Array<
      Omit<ManagedCronJobRow, 'headers_config'> & {
        headers_config: ManagedCronHeaderConfig[] | string | null;
      }
    >
  >`
    with due_jobs as (
      select j.id
      from public.workspace_cron_jobs j
      where
        j.active = true
        and j.endpoint_url is not null
        and length(trim(j.endpoint_url)) > 0
        and (j.next_run_at is null or j.next_run_at <= now())
        and (
          j.locked_at is null
          or j.locked_at < now() - make_interval(secs => ${LOCK_TTL_SECONDS})
        )
        and exists (
          select 1
          from public.workspace_secrets s
          where
            s.ws_id = j.ws_id
            and s.name = 'MANAGED_CRON_ENABLED'
            and lower(trim(s.value)) = 'true'
        )
      order by j.next_run_at nulls first, j.created_at asc
      limit ${limit}
      for update skip locked
    )
    update public.workspace_cron_jobs j
    set
      locked_at = now(),
      locked_by = ${runnerId}
    from due_jobs
    where j.id = due_jobs.id
    returning
      j.id::text,
      j.ws_id::text,
      j.name,
      j.schedule,
      j.active,
      j.endpoint_url,
      j.http_method,
      j.headers_config,
      j.timeout_ms,
      j.retry_count
  `;

  return rows.map(
    (row): ManagedCronJobRow => ({
      ...row,
      headers_config: parseHeaderConfig(row.headers_config),
    })
  );
}

async function executeManagedCronJob({
  allowedDomains,
  fetchImpl,
  job,
  sql,
}: {
  allowedDomains: string[];
  fetchImpl: typeof fetch;
  job: ManagedCronJobRow;
  sql: Sql;
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
      sql,
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
      const response = await fetchImpl(validation.url, {
        headers,
        method: job.http_method,
        signal: abortController.signal,
      });
      const text = await response.text();
      const endTime = new Date();

      if (response.ok || attempt === maxAttempts) {
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
  sql,
}: {
  job: ManagedCronJobRow;
  result: ManagedCronExecutionResult;
  runnerId: string;
  sql: Sql;
}) {
  const executionId = crypto.randomUUID();
  const nextRunAt = getNextManagedCronRunAt(job.schedule, result.endTime);
  const response =
    result.response?.slice(0, MANAGED_CRON_MAX_RESPONSE_CHARS) ?? null;
  const error = result.error?.slice(0, 2000) ?? null;

  await sql.begin(async (transaction) => {
    await transaction`
      insert into public.workspace_cron_executions (
        id,
        job_id,
        status,
        start_time,
        end_time,
        response,
        http_status,
        duration_ms,
        error,
        endpoint_url
      )
      values (
        ${executionId},
        ${job.id},
        ${result.status},
        ${result.startTime.toISOString()},
        ${result.endTime.toISOString()},
        ${response},
        ${result.httpStatus},
        ${Math.max(0, result.durationMs)},
        ${error},
        ${result.url}
      )
    `;

    await transaction`
      update public.workspace_cron_jobs
      set
        next_run_at = ${nextRunAt.toISOString()},
        last_run_at = ${result.endTime.toISOString()},
        locked_at = null,
        locked_by = null,
        failure_count = case
          when ${result.status === 'success'} then 0
          else failure_count + 1
        end,
        last_status = ${result.status}
      where id = ${job.id}
        and locked_by = ${runnerId}
    `;
  });
}

async function loadWorkspaceSecretValues({
  secretNames,
  sql,
  wsId,
}: {
  secretNames: string[];
  sql: Sql;
  wsId: string;
}) {
  const values = new Map<string, string>();
  if (secretNames.length === 0) return values;

  const rows = await sql<{ name: string; value: string }[]>`
    select name, value
    from public.workspace_secrets
    where ws_id = ${wsId}
      and name in ${sql(secretNames)}
  `;

  for (const row of rows) {
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
