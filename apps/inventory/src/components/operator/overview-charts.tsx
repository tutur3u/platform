'use client';

import { BarChart3, TrendingUp } from '@tuturuuu/icons';
import type { InventoryDashboardSnapshot } from '@tuturuuu/internal-api/inventory';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  INVENTORY_CHART_PRIMARY,
  INVENTORY_CHART_SECONDARY,
} from './inventory-chart-colors';
import { OperatorModuleCard } from './operator-dashboard-primitives';
import { money } from './operator-format';
import { useWorkspaceCurrency } from './workspace-currency';

export function OverviewCharts({
  dashboard,
}: {
  dashboard: InventoryDashboardSnapshot | null | undefined;
}) {
  const t = useTranslations('inventory.operator.dashboard');
  const workspaceCurrency = useWorkspaceCurrency();
  const trend = dashboard?.analytics.revenueTrend ?? [];
  const categoryMix = dashboard?.analytics.categoryMix.slice(0, 6) ?? [];
  const revenueConfig = {
    revenue: {
      color: INVENTORY_CHART_PRIMARY,
      label: t('revenue'),
    },
  } satisfies ChartConfig;
  const mixConfig = {
    revenue: {
      color: INVENTORY_CHART_SECONDARY,
      label: t('revenue'),
    },
  } satisfies ChartConfig;

  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <OperatorModuleCard
        description={t('revenueDescription')}
        icon={TrendingUp}
        title={t('revenueTrend')}
      >
        {trend.length ? (
          <ChartContainer className="h-64 w-full" config={revenueConfig}>
            <AreaChart data={trend}>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis axisLine={false} tickLine={false} width={42} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      money(Number(value), workspaceCurrency)
                    }
                  />
                }
              />
              <Area
                dataKey="revenue"
                fill="var(--color-revenue)"
                fillOpacity={0.16}
                stroke="var(--color-revenue)"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState label={t('noRevenue')} />
        )}
      </OperatorModuleCard>
      <OperatorModuleCard
        description={t('mixDescription')}
        icon={BarChart3}
        title={t('categoryMix')}
      >
        {categoryMix.length ? (
          <ChartContainer className="h-64 w-full" config={mixConfig}>
            <BarChart data={categoryMix} layout="vertical">
              <CartesianGrid horizontal={false} />
              <XAxis axisLine={false} tickLine={false} type="number" />
              <YAxis
                axisLine={false}
                dataKey="label"
                tickLine={false}
                type="category"
                width={96}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      money(Number(value), workspaceCurrency)
                    }
                  />
                }
              />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
            </BarChart>
          </ChartContainer>
        ) : (
          <ChartEmptyState label={t('noMix')} />
        )}
      </OperatorModuleCard>
    </div>
  );
}

function ChartEmptyState({ label }: { label: string }) {
  return (
    <div className="grid h-64 place-items-center rounded-lg border border-border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}
