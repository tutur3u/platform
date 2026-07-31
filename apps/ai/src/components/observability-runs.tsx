'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDownIcon } from '@tuturuuu/icons';
import {
  type AiStudioRun,
  getAiStudioRunDetail,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { formatTraceDuration } from '@/lib/playground-trace';
import { InfiniteLoadTrigger } from './infinite-load-trigger';
import { ObservabilityRunDetail } from './observability-run-detail';
import { RelativeTimestamp } from './relative-timestamp';
import { SectionCard } from './studio/section-card';
import { StudioEmptyState } from './studio/states';
import { normalizeRunStatus, StatusPill } from './studio/status-pill';
import { tableClasses } from './studio/table';

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

  const numericHeaders = [
    t('tokens'),
    t('media_units'),
    t('billed_credits'),
    t('provider_cost_short'),
    t('latency'),
  ];

  return (
    <SectionCard
      description={t('activity_explorer_description')}
      flush
      icon={Activity}
      title={t('activity_explorer')}
    >
      <div className={`${tableClasses.scroller} max-h-[70vh]`}>
        <table className={`${tableClasses.table} min-w-[76rem]`}>
          <thead className={tableClasses.head}>
            <tr>
              <th className={tableClasses.headCell}>{t('request')}</th>
              <th className={tableClasses.headCell}>{t('time')}</th>
              <th className={tableClasses.headCell}>{t('model')}</th>
              <th className={tableClasses.headCell}>{t('feature')}</th>
              <th className={tableClasses.headCell}>{t('source')}</th>
              <th className={tableClasses.headCell}>{t('status')}</th>
              {numericHeaders.map((label) => (
                <th className={tableClasses.headCellNumeric} key={label}>
                  {label}
                </th>
              ))}
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
    </SectionCard>
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
        className={`cursor-pointer ${tableClasses.bodyRow}`}
        data-state={open ? 'open' : 'closed'}
        onClick={toggleOpen}
      >
        <td className={`${tableClasses.cell} max-w-56`}>
          <Button
            aria-expanded={open}
            aria-label={open ? t('collapse_run') : t('expand_run')}
            className="h-auto max-w-full justify-start gap-1.5 px-1 py-0.5 font-mono text-xs"
            onClick={(event) => {
              event.stopPropagation();
              toggleOpen();
            }}
            variant="ghost"
          >
            <ChevronDownIcon
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
            <span className="truncate">{run.requestId}</span>
          </Button>
        </td>
        <td
          className={`${tableClasses.cell} text-muted-foreground text-xs`}
          onClick={(event) => event.stopPropagation()}
        >
          <RelativeTimestamp value={run.completedAt ?? run.createdAt} />
        </td>
        <td className={`${tableClasses.cell} max-w-52 truncate`}>
          {run.modelId}
        </td>
        <td
          className={`${tableClasses.cell} max-w-44 truncate text-muted-foreground`}
        >
          {run.feature}
        </td>
        <td className={`${tableClasses.cell} text-muted-foreground text-xs`}>
          {sourceLabel}
        </td>
        <td className={tableClasses.cell}>
          <StatusPill
            label={statusLabel}
            status={normalizeRunStatus(run.status)}
          />
        </td>
        <td className={tableClasses.numericCell}>
          {(
            run.inputTokens +
            run.outputTokens +
            run.reasoningTokens
          ).toLocaleString()}
        </td>
        <td className={tableClasses.numericCell}>
          {(
            run.embeddingUnits +
            run.imageUnits +
            run.searchUnits
          ).toLocaleString()}
        </td>
        <td className={tableClasses.numericCell}>
          {run.billedCredits.toLocaleString(undefined, {
            maximumFractionDigits: 4,
          })}
        </td>
        <td className={`${tableClasses.numericCell} text-muted-foreground`}>
          $
          {run.providerCostUsd.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        </td>
        <td className={tableClasses.numericCell}>
          {formatTraceDuration(run.latencyMs)}
        </td>
      </tr>
      {open ? (
        <tr className="border-b bg-muted/25">
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
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton className="h-9 w-full" key={index} />
      ))}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="p-4">
      <StudioEmptyState
        description={t('empty_filtered_description')}
        icon={Activity}
        title={t('empty_title')}
      />
    </div>
  );
}
