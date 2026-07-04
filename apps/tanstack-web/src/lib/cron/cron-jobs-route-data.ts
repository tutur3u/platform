import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type ListWorkspaceCronJobsResponse,
  listWorkspaceCronJobs,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';

export type CronJobsSearch = {
  page: number;
  pageSize: number;
  q: string;
};

export type CronJobsRouteData = CronJobsSearch & {
  jobs: ListWorkspaceCronJobsResponse;
  locale: string;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

export function validateCronJobsSearch(
  search: Record<string, unknown>
): CronJobsSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 10, 100),
    q: typeof search.q === 'string' ? search.q : '',
  };
}

export const loadCronJobsData = createServerFn({ method: 'GET' })
  .validator((data: CronJobsSearch & { wsId: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<Omit<CronJobsRouteData, 'locale' | 'workspaceId'>> => ({
      jobs: await listWorkspaceCronJobs(
        data.wsId,
        {
          page: data.page,
          pageSize: data.pageSize,
          q: data.q,
        },
        withForwardedInternalApiAuth(getRequestHeaders())
      ),
      page: data.page,
      pageSize: data.pageSize,
      q: data.q,
    })
  );
