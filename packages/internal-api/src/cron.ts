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
    value.toLowerCase().includes(query)
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
