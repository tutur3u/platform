'use client';

import type { AiStudioUsageRow } from '@tuturuuu/internal-api/ai-studio';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { aggregateUsageRows } from './observability-helpers';

export function ObservabilityBreakdowns({
  isLoading,
  rows,
}: {
  isLoading: boolean;
  rows: AiStudioUsageRow[];
}) {
  const t = useTranslations('ai-studio.observability');
  const sourceLabel = (row: AiStudioUsageRow) => {
    switch (row.sourceType) {
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
  const tables = [
    {
      rows: aggregateUsageRows(rows, (row) => row.modelId),
      title: t('by_model'),
    },
    {
      rows: aggregateUsageRows(rows, (row) => row.feature),
      title: t('by_feature'),
    },
    {
      rows: aggregateUsageRows(rows, sourceLabel),
      title: t('by_source'),
    },
    {
      className: 'xl:col-span-2',
      rows: aggregateUsageRows(rows, (row) => row.bucketDate),
      title: t('daily_usage'),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <Skeleton className="h-8 w-full" key={rowIndex} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {tables.map((table) => (
        <BreakdownTable key={table.title} {...table} />
      ))}
    </div>
  );
}

function BreakdownTable({
  className,
  rows,
  title,
}: {
  className?: string;
  rows: ReturnType<typeof aggregateUsageRows>;
  title: string;
}) {
  const t = useTranslations('ai-studio.observability');
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">{t('dimension')}</th>
              <th className="p-3 text-right font-medium">{t('requests')}</th>
              <th className="p-3 text-right font-medium">
                {t('billed_credits')}
              </th>
              <th className="p-3 text-right font-medium">
                {t('provider_cost_short')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b last:border-0" key={row.label}>
                <td className="max-w-64 truncate p-3 font-medium">
                  {row.label}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.requests.toLocaleString()}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.credits.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td className="p-3 text-right tabular-nums">
                  $
                  {row.cost.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState /> : null}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="p-10 text-center">
      <p className="font-medium">{t('empty_title')}</p>
      <p className="mt-1 text-muted-foreground text-sm">
        {t('empty_description')}
      </p>
    </div>
  );
}
