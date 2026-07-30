'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, MousePointerClick } from '@tuturuuu/icons';
import {
  type AiStudioRun,
  getAiStudioRunDetail,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { formatTraceDuration } from '@/lib/playground-trace';
import { InfiniteLoadTrigger } from './infinite-load-trigger';
import { ObservabilityRunDetail } from './observability-run-detail';
import { RelativeTimestamp } from './relative-timestamp';

export function ObservabilityRuns({
  isFetchingMore,
  isLoading,
  onLoadMore,
  onSelectedRunChange,
  runs,
  selectedRunId,
  hasNextPage,
  hasLoadError,
  workspaceId,
}: {
  isFetchingMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onSelectedRunChange: (runId: string | null) => void;
  runs: AiStudioRun[];
  selectedRunId: string | null;
  hasNextPage: boolean;
  hasLoadError: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const sourceLabel = (source: AiStudioRun['sourceType']) => {
    switch (source) {
      case 'api_key':
        return t('source_api_key');
      case 'external_app':
        return t('source_external_app');
      case 'workspace_credit':
        return t('source_workspace_credit');
      default:
        return t('source_session');
    }
  };
  const statusLabel = (status: AiStudioRun['status']) =>
    t(`status_${status}` as Parameters<typeof t>[0]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/10 p-4">
          <div>
            <p className="font-medium">{t('activity_explorer')}</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('activity_explorer_description')}
            </p>
          </div>
          <Badge variant="outline">
            <MousePointerClick className="mr-1.5 size-3.5" />
            {t('select_activity')}
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[80rem] text-sm">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="p-3 text-left font-medium">{t('request')}</th>
                <th className="p-3 text-left font-medium">{t('time')}</th>
                <th className="p-3 text-left font-medium">{t('model')}</th>
                <th className="p-3 text-left font-medium">{t('feature')}</th>
                <th className="p-3 text-left font-medium">{t('source')}</th>
                <th className="p-3 text-left font-medium">{t('status')}</th>
                <th className="p-3 text-right font-medium">{t('tokens')}</th>
                <th className="p-3 text-right font-medium">
                  {t('media_units')}
                </th>
                <th className="p-3 text-right font-medium">
                  {t('billed_credits')}
                </th>
                <th className="p-3 text-right font-medium">
                  {t('provider_cost_short')}
                </th>
                <th className="p-3 text-right font-medium">{t('latency')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  onOpenChange={(open) =>
                    onSelectedRunChange(open ? run.id : null)
                  }
                  open={selectedRunId === run.id}
                  run={run}
                  sourceLabel={sourceLabel(run.sourceType)}
                  statusLabel={statusLabel(run.status)}
                  workspaceId={workspaceId}
                />
              ))}
            </tbody>
          </table>
        </div>
        {isLoading ? <RunsSkeleton /> : null}
        {!isLoading && runs.length === 0 ? <EmptyState /> : null}
        {!isLoading && runs.length > 0 ? (
          <InfiniteLoadTrigger
            endLabel={t('end_of_list')}
            errorLabel={t('error_description')}
            hasError={hasLoadError}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingMore}
            loadedLabel={t('loaded_count', { count: runs.length })}
            loadingLabel={t('loading')}
            loadMoreLabel={t('load_more')}
            onLoadMore={onLoadMore}
            retryLabel={t('retry')}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunRow({
  onOpenChange,
  open,
  run,
  sourceLabel,
  statusLabel,
  workspaceId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  run: AiStudioRun;
  sourceLabel: string;
  statusLabel: string;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const detailQuery = useQuery({
    enabled: open && run.sourceType !== 'workspace_credit',
    queryFn: () => getAiStudioRunDetail(workspaceId, run.id),
    queryKey: ['ai-studio-run-detail', workspaceId, run.id],
    staleTime: 60_000,
  });
  const hasPersistedTrace = run.sourceType !== 'workspace_credit';
  const toggleOpen = () => onOpenChange(!open);

  return (
    <Fragment>
      <tr
        className="cursor-pointer border-b transition-colors hover:bg-muted/30 data-[state=open]:bg-muted/30"
        data-state={open ? 'open' : 'closed'}
        onClick={toggleOpen}
      >
        <td className="max-w-52 p-3 font-mono text-xs">
          <Button
            aria-expanded={open}
            aria-label={open ? t('collapse_run') : t('expand_run')}
            className="h-auto max-w-full justify-start px-1 py-1 font-mono text-xs"
            onClick={(event) => {
              event.stopPropagation();
              toggleOpen();
            }}
            variant="ghost"
          >
            <ChevronDownIcon
              className={`mr-2 size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            <span className="truncate">{run.requestId}</span>
          </Button>
        </td>
        <td
          className="p-3 text-muted-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <RelativeTimestamp value={run.completedAt ?? run.createdAt} />
        </td>
        <td className="max-w-52 truncate p-3">{run.modelId}</td>
        <td className="max-w-44 truncate p-3">{run.feature}</td>
        <td className="p-3">{sourceLabel}</td>
        <td className="p-3">
          <Badge variant="outline">{statusLabel}</Badge>
        </td>
        <td className="p-3 text-right tabular-nums">
          {(
            run.inputTokens +
            run.outputTokens +
            run.reasoningTokens
          ).toLocaleString()}
        </td>
        <td className="p-3 text-right tabular-nums">
          {(
            run.embeddingUnits +
            run.imageUnits +
            run.searchUnits
          ).toLocaleString()}
        </td>
        <td className="p-3 text-right tabular-nums">
          {run.billedCredits.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}
        </td>
        <td className="p-3 text-right tabular-nums">
          $
          {run.providerCostUsd.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        </td>
        <td className="p-3 text-right tabular-nums">
          {formatTraceDuration(run.latencyMs)}
        </td>
      </tr>
      {open ? (
        <tr className="border-b bg-muted/15">
          <td className="p-0" colSpan={11}>
            <ObservabilityRunDetail
              isError={hasPersistedTrace && detailQuery.isError}
              isLoading={hasPersistedTrace && detailQuery.isPending}
              onRetry={() => void detailQuery.refetch()}
              run={run}
              sourceLabel={sourceLabel}
              statusLabel={statusLabel}
              steps={detailQuery.data?.steps ?? []}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function RunsSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton className="h-9 w-full" key={index} />
      ))}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="p-10 text-center">
      <p className="font-medium">{t('empty_title')}</p>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('empty_filtered_description')}
      </p>
    </div>
  );
}
