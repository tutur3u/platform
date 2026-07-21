import { queryOptions } from '@tanstack/react-query';
import { getWorkspaceExternalProjectSummary } from '@tuturuuu/internal-api';
import {
  getCmsCommerceInsights,
  getCmsCommerceOverview,
} from '@/lib/commerce-client';

const HOME_STALE_TIME = 2 * 60 * 1000;

export const cmsHomeSummaryQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryFn: () => getWorkspaceExternalProjectSummary(workspaceId),
    queryKey: ['cms-home', workspaceId, 'summary'] as const,
    staleTime: HOME_STALE_TIME,
  });

export const cmsHomeCommerceQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryFn: () => getCmsCommerceOverview(workspaceId),
    queryKey: ['cms-home', workspaceId, 'commerce'] as const,
    retry: 1,
    staleTime: HOME_STALE_TIME,
  });

export const cmsHomeInsightsQueryOptions = (workspaceId: string) =>
  queryOptions({
    queryFn: () => getCmsCommerceInsights(workspaceId),
    queryKey: ['cms-home', workspaceId, 'insights'] as const,
    retry: 1,
    staleTime: HOME_STALE_TIME,
  });
