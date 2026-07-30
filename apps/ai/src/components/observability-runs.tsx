'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, Cpu, Terminal } from '@tuturuuu/icons';
import {
  type AiStudioRun,
  getAiStudioRunDetail,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

export function ObservabilityRuns({
  isFetchingMore,
  isLoading,
  onLoadMore,
  runs,
  showLoadMore,
  workspaceId,
}: {
  isFetchingMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  runs: AiStudioRun[];
  showLoadMore: boolean;
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
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[72rem] text-sm">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">{t('request')}</th>
              <th className="p-3 text-left font-medium">{t('model')}</th>
              <th className="p-3 text-left font-medium">{t('feature')}</th>
              <th className="p-3 text-left font-medium">{t('source')}</th>
              <th className="p-3 text-left font-medium">{t('status')}</th>
              <th className="p-3 text-right font-medium">{t('tokens')}</th>
              <th className="p-3 text-right font-medium">{t('media_units')}</th>
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
                run={run}
                sourceLabel={sourceLabel(run.sourceType)}
                statusLabel={statusLabel(run.status)}
                workspaceId={workspaceId}
              />
            ))}
          </tbody>
        </table>
        {isLoading ? <RunsSkeleton /> : null}
        {!isLoading && runs.length === 0 ? <EmptyState /> : null}
        {showLoadMore ? (
          <div className="flex justify-center border-t p-4">
            <Button
              disabled={isFetchingMore}
              onClick={onLoadMore}
              variant="outline"
            >
              {isFetchingMore ? t('loading') : t('load_more')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RunRow({
  run,
  sourceLabel,
  statusLabel,
  workspaceId,
}: {
  run: AiStudioRun;
  sourceLabel: string;
  statusLabel: string;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.observability');
  const [open, setOpen] = useState(false);
  const detailQuery = useQuery({
    enabled: open && run.sourceType !== 'workspace_credit',
    queryFn: () => getAiStudioRunDetail(workspaceId, run.id),
    queryKey: ['ai-studio-run-detail', workspaceId, run.id],
  });
  const expandable =
    run.sourceType !== 'workspace_credit' &&
    (run.stepCount > 0 || run.toolCallCount > 0);

  return (
    <Fragment>
      <tr className="border-b">
        <td className="max-w-52 p-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            {expandable ? (
              <Button
                aria-expanded={open}
                aria-label={open ? t('collapse_run') : t('expand_run')}
                onClick={() => setOpen((value) => !value)}
                size="icon"
                variant="ghost"
              >
                <ChevronDownIcon
                  className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </Button>
            ) : (
              <span className="size-9" />
            )}
            <span className="truncate">{run.requestId}</span>
          </div>
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
          {run.latencyMs === null ? '—' : `${run.latencyMs} ms`}
        </td>
      </tr>
      {expandable && open ? (
        <tr className="border-b bg-muted/15">
          <td className="p-4" colSpan={10}>
            {detailQuery.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : detailQuery.isError ? (
              <p className="text-dynamic-red text-sm">{t('trace_error')}</p>
            ) : (
              <div className="ml-10 grid gap-2">
                <div className="mb-1 flex items-center gap-2">
                  <p className="font-medium text-sm">{t('execution_trace')}</p>
                  <Badge variant="secondary">
                    {t('step_count', {
                      count: detailQuery.data.steps.length,
                    })}
                  </Badge>
                  {run.toolCallCount ? (
                    <Badge variant="outline">
                      {t('tool_call_count', {
                        count: run.toolCallCount,
                      })}
                    </Badge>
                  ) : null}
                </div>
                {detailQuery.data.steps.map((step) => (
                  <div
                    className="grid items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs sm:grid-cols-[auto_auto_minmax(8rem,1fr)_auto_auto_auto]"
                    key={step.sequence}
                  >
                    <Badge variant="secondary">#{step.sequence + 1}</Badge>
                    {step.kind === 'tool' ? (
                      <Terminal className="size-4 text-primary" />
                    ) : (
                      <Cpu className="size-4 text-primary" />
                    )}
                    <div>
                      <p className="font-medium">{step.name}</p>
                      <p className="text-muted-foreground">
                        {step.modelId ?? t(`step_${step.kind}`)}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {t(`status_${step.status}`)}
                    </Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {(step.inputTokens + step.outputTokens).toLocaleString()}{' '}
                      {t('tokens')}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {step.latencyMs === null ? '—' : `${step.latencyMs} ms`}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
