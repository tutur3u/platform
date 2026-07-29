'use client';

import type { AiStudioRun } from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

export function ObservabilityRuns({
  isFetchingMore,
  isLoading,
  onLoadMore,
  runs,
  showLoadMore,
}: {
  isFetchingMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  runs: AiStudioRun[];
  showLoadMore: boolean;
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
              <tr className="border-b last:border-0" key={run.id}>
                <td className="max-w-52 truncate p-3 font-mono text-xs">
                  {run.requestId}
                </td>
                <td className="max-w-52 truncate p-3">{run.modelId}</td>
                <td className="max-w-44 truncate p-3">{run.feature}</td>
                <td className="p-3">{sourceLabel(run.sourceType)}</td>
                <td className="p-3">
                  <Badge variant="outline">{statusLabel(run.status)}</Badge>
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
