'use client';

import {
  BarChart3,
  Boxes,
  Package,
  ReceiptText,
  TrendingUp,
} from '@tuturuuu/icons';
import type { InventoryAnalyticsResponse } from '@tuturuuu/internal-api/inventory';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useLocale, useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  OperatorMetricCard,
  OperatorModuleCard,
} from './operator-dashboard-primitives';
import { currency } from './operator-format';

const chartColors = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function compact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const value = delta(current, previous);
  return (
    <span>
      {t('change', {
        value: new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 1,
          signDisplay: 'always',
        }).format(value),
      })}
    </span>
  );
}

export function AnalyticsKpis({ data }: { data: InventoryAnalyticsResponse }) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const summary = data.summary;
  const previous = data.previousSummary;
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <OperatorMetricCard
        description={
          <Delta current={summary.revenue} previous={previous.revenue} />
        }
        icon={TrendingUp}
        label={t('revenue')}
        value={currency(summary.revenue, data.currency)}
      />
      <OperatorMetricCard
        description={
          <Delta current={summary.sales} previous={previous.sales} />
        }
        icon={ReceiptText}
        label={t('sales')}
        value={summary.sales.toLocaleString()}
      />
      <OperatorMetricCard
        description={t('unitsDescription')}
        icon={Package}
        label={t('units')}
        value={summary.units.toLocaleString()}
      />
      <OperatorMetricCard
        description={t('aovDescription')}
        icon={BarChart3}
        label={t('averageOrderValue')}
        value={currency(summary.averageOrderValue, data.currency)}
      />
      <OperatorMetricCard
        description={t('estimatedDescription')}
        icon={TrendingUp}
        label={t('estimatedProfit')}
        value={currency(summary.estimatedGrossProfit ?? 0, data.currency)}
      />
      <OperatorMetricCard
        description={t('inventoryValueDescription')}
        icon={Boxes}
        label={t('inventoryValue')}
        value={currency(summary.inventoryValue ?? 0, data.currency)}
      />
      <OperatorMetricCard
        description={t('stockCoverageDescription')}
        icon={Package}
        label={t('stockCoverage')}
        value={`${data.quality.stockCoveragePercentage.toFixed(1)}%`}
      />
      <OperatorMetricCard
        description={t('riskDescription')}
        icon={Boxes}
        label={t('stockRisk')}
        tone={(summary.lowStockRows ?? 0) > 0 ? 'warning' : 'success'}
        value={(summary.lowStockRows ?? 0).toLocaleString()}
      />
    </div>
  );
}

export function AnalyticsCharts({
  data,
}: {
  data: InventoryAnalyticsResponse;
}) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const locale = useLocale();
  const revenueConfig = {
    revenue: { color: 'hsl(var(--primary))', label: t('currentPeriod') },
    previousRevenue: {
      color: 'hsl(var(--muted-foreground))',
      label: t('previousPeriod'),
    },
  } satisfies ChartConfig;
  const barConfig = {
    revenue: { color: 'hsl(var(--primary))', label: t('revenue') },
  } satisfies ChartConfig;
  const unitConfig = {
    sales: { color: 'hsl(var(--primary))', label: t('sales') },
  } satisfies ChartConfig;
  const trend = data.trend.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(point.date)),
  }));
  const weekdayNames = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, index + 1)))
  );
  const weekdays = data.weekdays.map((point) => ({
    ...point,
    label: weekdayNames[point.day - 1],
  }));
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <OperatorModuleCard
        className="xl:col-span-2"
        description={t('trendDescription')}
        icon={TrendingUp}
        title={t('revenueTrend')}
      >
        <ChartContainer className="h-72 w-full" config={revenueConfig}>
          <AreaChart accessibilityLayer data={trend}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={28}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value) => compact(Number(value), locale)}
              tickLine={false}
              width={52}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              dataKey="previousRevenue"
              fill="var(--color-previousRevenue)"
              fillOpacity={0.05}
              stroke="var(--color-previousRevenue)"
              strokeDasharray="4 4"
              type="monotone"
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
      </OperatorModuleCard>
      <MetricBarCard
        config={barConfig}
        data={data.categoryMix.slice(0, 8)}
        description={t('categoryDescription')}
        title={t('categoryMix')}
      />
      <MetricBarCard
        config={barConfig}
        data={data.ownerMix.slice(0, 8)}
        description={t('ownerDescription')}
        title={t('ownerMix')}
      />
      <OperatorModuleCard
        description={t('channelDescription')}
        icon={BarChart3}
        title={t('channelMix')}
      >
        {data.channels.length ? (
          <div className="grid items-center gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <ChartContainer className="h-44 w-full" config={barConfig}>
              <PieChart accessibilityLayer>
                <Pie
                  data={data.channels}
                  dataKey="revenue"
                  innerRadius={42}
                  nameKey="label"
                  outerRadius={70}
                >
                  {data.channels.map((item, index) => (
                    <Cell
                      fill={chartColors[index % chartColors.length]}
                      key={item.label}
                    />
                  ))}
                </Pie>
                <ChartTooltip
                  content={<ChartTooltipContent nameKey="label" />}
                />
              </PieChart>
            </ChartContainer>
            <div className="grid gap-2">
              {data.channels.map((item, index) => (
                <div
                  className="flex items-center justify-between gap-3 text-sm"
                  key={item.label}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: chartColors[index % chartColors.length],
                      }}
                    />
                    <span className="truncate capitalize">{item.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {currency(item.revenue, data.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ChartEmpty label={t('empty')} />
        )}
      </OperatorModuleCard>
      <OperatorModuleCard
        description={t('weekdayDescription')}
        icon={BarChart3}
        title={t('weekdayDemand')}
      >
        <ChartContainer className="h-64 w-full" config={unitConfig}>
          <BarChart accessibilityLayer data={weekdays}>
            <CartesianGrid vertical={false} />
            <XAxis axisLine={false} dataKey="label" tickLine={false} />
            <YAxis
              axisLine={false}
              allowDecimals={false}
              tickLine={false}
              width={36}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="sales"
              fill="var(--color-sales)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </OperatorModuleCard>
    </div>
  );
}

function MetricBarCard({
  config,
  data,
  description,
  title,
}: {
  config: ChartConfig;
  data: InventoryAnalyticsResponse['categoryMix'];
  description: string;
  title: string;
}) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  return (
    <OperatorModuleCard
      description={description}
      icon={BarChart3}
      title={title}
    >
      {data.length ? (
        <ChartContainer className="h-64 w-full" config={config}>
          <BarChart accessibilityLayer data={data} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis axisLine={false} tickLine={false} type="number" />
            <YAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              type="category"
              width={105}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>
      ) : (
        <ChartEmpty label={t('empty')} />
      )}
    </OperatorModuleCard>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="grid h-48 place-items-center rounded-lg border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}
