'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  type AiStudioRunsResponse,
  getAiStudioCredits,
  getAiStudioRuns,
  getAiStudioUsage,
} from '@tuturuuu/internal-api/ai-studio';
import { useTranslations } from 'next-intl';
import { ObservabilityBreakdowns } from './observability-breakdowns';
import { useObservabilityFilters } from './observability-filters';
import { ObservabilityRuns } from './observability-runs';
import { ObservabilitySummary } from './observability-summary';
import { ObservabilityToolbar } from './observability-toolbar';
import { ObservabilityUsageCharts } from './observability-usage-charts';
import { StudioErrorState } from './studio/states';

type ObservabilitySection = 'credits' | 'runs' | 'usage';

export function ObservabilityPanel({
  section,
  workspaceId,
}: {
  section: ObservabilitySection;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const controls = useObservabilityFilters();
  const { deferredFeature, deferredModel, filters, range } = controls;
  const isRunSection = section === 'runs';

  const usageQuery = useQuery({
    enabled: Boolean(range),
    queryFn: () => getAiStudioUsage(workspaceId, range!),
    queryKey: ['ai-studio-usage', workspaceId, range],
  });
  const creditsQuery = useQuery({
    enabled: section === 'credits',
    queryFn: () => getAiStudioCredits(workspaceId),
    queryKey: ['ai-studio-credits', workspaceId],
  });
  const runsQuery = useInfiniteQuery({
    enabled: Boolean(range) && isRunSection,
    getNextPageParam: (lastPage: AiStudioRunsResponse) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAiStudioRuns(workspaceId, {
        cursor: pageParam,
        feature: deferredFeature || undefined,
        from: range!.from,
        limit: 50,
        model: deferredModel || undefined,
        status: filters.status === 'all' ? undefined : filters.status,
        to: range!.to,
      }),
    queryKey: [
      'ai-studio-runs',
      workspaceId,
      range,
      filters.status,
      deferredModel,
      deferredFeature,
    ],
  });

  const runs = runsQuery.data?.pages.flatMap((page) => page.runs) ?? [];
  const hasError =
    usageQuery.isError ||
    (section === 'credits' && creditsQuery.isError) ||
    (isRunSection && runsQuery.isError && runs.length === 0);
  const isRefreshing =
    usageQuery.isFetching ||
    runsQuery.isFetching ||
    (section === 'credits' && creditsQuery.isFetching);

  const refresh = () => {
    if (filters.range === 'custom') {
      void usageQuery.refetch();
      if (isRunSection) void runsQuery.refetch();
    } else {
      controls.reanchorRange();
    }
    if (section === 'credits') void creditsQuery.refetch();
  };

  return (
    <div className="space-y-4">
      <ObservabilityToolbar
        controls={controls}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        showRunFilters={isRunSection}
      />

      {hasError ? (
        <StudioErrorState
          description={t('error_description')}
          onRetry={refresh}
          retryLabel={t('retry')}
          title={t('error_title')}
        />
      ) : null}

      <ObservabilitySummary
        credits={creditsQuery.data}
        isLoading={
          usageQuery.isPending ||
          (section === 'credits' && creditsQuery.isPending)
        }
        section={section}
        totals={usageQuery.data?.totals}
      />

      {isRunSection ? (
        <ObservabilityRuns
          hasLoadError={runsQuery.isFetchNextPageError}
          hasNextPage={Boolean(runsQuery.hasNextPage)}
          isFetchingMore={runsQuery.isFetchingNextPage}
          isLoading={runsQuery.isPending}
          onLoadMore={() => void runsQuery.fetchNextPage()}
          onSelectedRunChange={controls.setSelectedRunId}
          runs={runs}
          selectedRunId={controls.selectedRunId}
          workspaceId={workspaceId}
        />
      ) : (
        <>
          <ObservabilityUsageCharts
            isLoading={usageQuery.isPending}
            rows={usageQuery.data?.rows ?? []}
          />
          <ObservabilityBreakdowns
            balanceConsumed={creditsQuery.data?.totalUsed ?? 0}
            isLoading={usageQuery.isPending}
            rows={usageQuery.data?.rows ?? []}
          />
        </>
      )}
    </div>
  );
}
