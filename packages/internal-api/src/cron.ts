import type { WorkspaceCronJob } from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type WorkspaceCronJobSummary = Pick<
  WorkspaceCronJob,
  | 'active'
  | 'created_at'
  | 'cron_job_id'
  | 'dataset_id'
  | 'id'
  | 'name'
  | 'schedule'
  | 'ws_id'
>;

export type WorkspaceCronHttpMethod =
  | 'DELETE'
  | 'GET'
  | 'PATCH'
  | 'POST'
  | 'PUT';

export interface WorkspaceCronHeaderConfig {
  name: string;
  secretName?: string | null;
  value?: string | null;
}

export interface SaveWorkspaceCronJobPayload {
  active: boolean;
  dataset_id?: string | null;
  endpoint_url?: string | null;
  headers_config?: WorkspaceCronHeaderConfig[];
  http_method?: WorkspaceCronHttpMethod;
  name: string;
  retry_count?: number;
  schedule: string;
  timeout_ms?: number;
}

export type ListWorkspaceCronJobsParams = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export type ListWorkspaceCronJobsResponse = {
  count: number;
  data: WorkspaceCronJobSummary[];
  page: number;
  pageSize: number;
};

function workspaceCronJobsPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/cron/jobs`;
}

function workspaceCronJobPath(workspaceId: string, jobId: string) {
  return `${workspaceCronJobsPath(workspaceId)}/${encodePathSegment(jobId)}`;
}

function normalizePage(
  value: number | undefined,
  fallback: number,
  max?: number
) {
  if (!Number.isInteger(value) || !value || value < 1) {
    return fallback;
  }

  return max ? Math.min(value, max) : value;
}

function matchesCronJobSearch(job: WorkspaceCronJobSummary, q: string) {
  const query = q.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [job.name, job.schedule, job.dataset_id, job.id].some((value) =>
    (value ?? '').toLowerCase().includes(query)
  );
}

function sortCronJobs(jobs: WorkspaceCronJobSummary[]) {
  return [...jobs].sort((first, second) =>
    first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
    })
  );
}

export async function listWorkspaceCronJobs(
  workspaceId: string,
  params: ListWorkspaceCronJobsParams = {},
  options?: InternalApiClientOptions
): Promise<ListWorkspaceCronJobsResponse> {
  const client = getInternalApiClient(options);
  const jobs = await client.json<WorkspaceCronJobSummary[]>(
    workspaceCronJobsPath(workspaceId),
    {
      cache: 'no-store',
    }
  );
  const page = normalizePage(params.page, 1);
  const pageSize = normalizePage(params.pageSize, 10, 100);
  const filteredJobs = sortCronJobs(
    jobs.filter((job) => matchesCronJobSearch(job, params.q ?? ''))
  );
  const start = (page - 1) * pageSize;

  return {
    count: filteredJobs.length,
    data: filteredJobs.slice(start, start + pageSize),
    page,
    pageSize,
  };
}

export async function createWorkspaceCronJob(
  workspaceId: string,
  payload: SaveWorkspaceCronJobPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: 'success' }>(
    workspaceCronJobsPath(workspaceId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceCronJob(
  workspaceId: string,
  jobId: string,
  payload: SaveWorkspaceCronJobPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: 'success' }>(
    workspaceCronJobPath(workspaceId, jobId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteWorkspaceCronJob(
  workspaceId: string,
  jobId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: 'success' }>(
    workspaceCronJobPath(workspaceId, jobId),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
