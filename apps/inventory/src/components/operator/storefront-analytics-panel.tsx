'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from '@tuturuuu/icons';
import { getInventoryStorefrontAnalytics } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

export function StorefrontAnalyticsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.analytics');
  const analytics = useQuery({
    queryFn: () => getInventoryStorefrontAnalytics(wsId, { days: 30 }),
    queryKey: ['inventory', wsId, 'storefront-analytics'],
  });

  const data = analytics.data;
  const funnel = data?.funnel ?? [];
  const top = funnel[0]?.count ?? 0;
  const hasEvents = funnel.some((stage) => stage.count > 0);
  const conversion = data ? Math.round(data.conversionRate * 1000) / 10 : 0;

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">{t('title')}</h3>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              {t('description', { days: data?.days ?? 30 })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-lg tabular-nums">{conversion}%</p>
          <p className="text-muted-foreground text-xs">{t('conversion')}</p>
        </div>
      </div>

      {hasEvents ? (
        <div className="grid gap-2">
          {funnel.map((stage) => {
            const pct = top > 0 ? Math.round((stage.count / top) * 100) : 0;
            return (
              <div className="grid gap-1" key={stage.key}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t(`stage.${stage.key}`)}
                  </span>
                  <span className="font-medium tabular-nums">
                    {stage.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.max(pct, stage.count > 0 ? 4 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-border border-dashed bg-muted/20 px-3 py-4 text-center text-muted-foreground text-sm">
          {t('empty')}
        </p>
      )}
    </section>
  );
}
