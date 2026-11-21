'use client';

import { useQuery } from '@tanstack/react-query';
import { getInfrastructureCosts } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { CostBreakdown } from './cost-breakdown';
import { CostInvoices } from './cost-invoices';
import { CostRecorded } from './cost-recorded';
import { CostCoverage, CostSignals } from './cost-signals';
import { CostSummary } from './cost-summary';
import { CostTrendChart } from './cost-trend-chart';
import { buildCostsView } from './cost-view';

export function CostsClient({ financeOrigin }: { financeOrigin: string }) {
  const t = useTranslations('infrastructure-costs');
  const query = useQuery({
    queryKey: ['infrastructure', 'costs'],
    queryFn: () => getInfrastructureCosts(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const view = buildCostsView(
    query.status === 'success'
      ? { data: query.data, status: 'success' }
      : { status: query.status }
  );

  return (
    <div className="space-y-8">
      <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
      {(() => {
        switch (view.kind) {
          case 'loading':
            return (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            );
          case 'error':
            return (
              <div
                role="alert"
                className="space-y-3 rounded-lg border bg-card px-4 py-4 md:px-5"
              >
                <p className="text-sm">{t('load_error')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void query.refetch()}
                >
                  {t('retry')}
                </Button>
              </div>
            );
          case 'empty':
            return (
              <>
                <div className="space-y-2 rounded-lg border bg-card px-4 py-4 md:px-5">
                  <p className="font-medium text-sm">{t('empty.title')}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('empty.description')}
                  </p>
                </div>
                <CostCoverage coverage={view.coverage} />
              </>
            );
          case 'ready':
            return (
              <>
                <CostSummary overview={view.overview} />
                <CostSignals anomalies={view.anomalies} />
                <CostTrendChart daily={view.daily} />
                <CostBreakdown breakdown={view.breakdown} />
                <CostInvoices
                  financeOrigin={financeOrigin}
                  invoices={view.invoices}
                  rootWorkspaceId={view.rootWorkspaceId}
                />
                <CostRecorded recorded={view.recorded} />
                <CostCoverage coverage={view.coverage} />
              </>
            );
          default: {
            const unreachable: never = view;
            return unreachable;
          }
        }
      })()}
    </div>
  );
}
