'use client';

import type { AiStudioUsageRow } from '@tuturuuu/internal-api/ai-studio';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { aggregateUsageRows } from './observability-helpers';
import { SectionCard } from './studio/section-card';
import { StudioEmptyState } from './studio/states';
import { tableClasses } from './studio/table';

export function ObservabilityBreakdowns({
  balanceConsumed,
  isLoading,
  rows,
}: {
  balanceConsumed: number;
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
  const appRows = rows.filter((row) => row.sourceType === 'external_app');
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
    // Only shown when an app actually ran something: an empty "by app" table on
    // a workspace with no integrations is noise, not information.
    ...(appRows.length
      ? [
          {
            rows: aggregateUsageRows(appRows, (row) => row.sourceId),
            title: t('by_external_app'),
          },
          {
            rows: aggregateUsageRows(appRows, (row) =>
              row.executionMode === 'background'
                ? t('execution_background')
                : t('execution_interactive')
            ),
            title: t('by_execution_mode'),
          },
        ]
      : []),
  ];

  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SectionCard key={index}>
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <Skeleton className="h-7 w-full" key={rowIndex} />
              ))}
            </div>
          </SectionCard>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {tables.map((table) => (
        <BreakdownTable
          hasBalanceUsage={balanceConsumed > 0}
          key={table.title}
          {...table}
        />
      ))}
    </div>
  );
}

function BreakdownTable({
  hasBalanceUsage,
  rows,
  title,
}: {
  hasBalanceUsage: boolean;
  rows: ReturnType<typeof aggregateUsageRows>;
  title: string;
}) {
  const t = useTranslations('ai-studio.observability');
  // Consumption, not billing: an unmetered app consumes real capacity even
  // though it is charged nothing, and a bar drawn from billed credits alone
  // would render it as a flat zero.
  const maxConsumed = Math.max(
    ...rows.map((row) => row.credits + row.unmetered),
    0
  );

  return (
    <SectionCard flush title={title}>
      {rows.length ? (
        <div className={`${tableClasses.scroller} max-h-96`}>
          <table className={tableClasses.table}>
            <thead className={tableClasses.head}>
              <tr>
                <th className={tableClasses.headCell}>{t('dimension')}</th>
                <th className={tableClasses.headCellNumeric}>
                  {t('requests')}
                </th>
                <th className={tableClasses.headCellNumeric}>
                  {t('billed_credits')}
                </th>
                <th className={tableClasses.headCellNumeric}>
                  {t('unmetered_credits_short')}
                </th>
                <th className={tableClasses.headCellNumeric}>
                  {t('provider_cost_short')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className={tableClasses.bodyRow} key={row.label}>
                  <td className={`${tableClasses.cell} max-w-56`}>
                    <div className="truncate font-medium text-xs">
                      {row.label}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className="h-full rounded-full bg-dynamic-purple/70"
                        style={{
                          width: maxConsumed
                            ? `${((row.credits + row.unmetered) / maxConsumed) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                  </td>
                  <td className={`${tableClasses.numericCell} text-xs`}>
                    {row.requests.toLocaleString()}
                  </td>
                  <td className={`${tableClasses.numericCell} text-xs`}>
                    {row.credits.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  <td
                    className={`${tableClasses.numericCell} text-dynamic-blue text-xs`}
                  >
                    {row.unmetered
                      ? row.unmetered.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })
                      : '—'}
                  </td>
                  <td
                    className={`${tableClasses.numericCell} text-muted-foreground text-xs`}
                  >
                    $
                    {row.cost.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <StudioEmptyState
            description={t(
              hasBalanceUsage
                ? 'empty_with_balance_description'
                : 'empty_description'
            )}
            title={t('empty_title')}
          />
        </div>
      )}
    </SectionCard>
  );
}
