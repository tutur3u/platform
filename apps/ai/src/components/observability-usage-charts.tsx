'use client';

import { Cpu } from '@tuturuuu/icons';
import type { AiStudioUsageRow } from '@tuturuuu/internal-api/ai-studio';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { aggregateUsageRows, buildUsageSeries } from './observability-helpers';
import { MeasureTrendChart } from './studio/measure-trend-chart';
import { SectionCard } from './studio/section-card';
import { StudioEmptyState } from './studio/states';

const TOP_MODEL_COUNT = 6;

const modelChartConfig = {
  credits: { color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function ObservabilityUsageCharts({
  isLoading,
  rows,
}: {
  isLoading: boolean;
  rows: AiStudioUsageRow[];
}) {
  const t = useTranslations('ai-studio.observability');
  const series = buildUsageSeries(rows);
  const topModels = aggregateUsageRows(rows, (row) => row.modelId).slice(
    0,
    TOP_MODEL_COUNT
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.5fr)]">
      <MeasureTrendChart
        data={series}
        description={t('daily_usage_description')}
        emptyDescription={t('empty_description')}
        emptyTitle={t('empty_title')}
        isLoading={isLoading}
        measureLabels={{
          cost: t('provider_cost_short'),
          credits: t('billed_credits'),
          requests: t('requests'),
        }}
        title={t('daily_usage')}
      />

      <SectionCard
        description={t('top_models_description')}
        icon={Cpu}
        title={t('top_models')}
      >
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : topModels.length ? (
          <ChartContainer className="h-56 w-full" config={modelChartConfig}>
            <BarChart
              data={topModels}
              layout="vertical"
              margin={{ bottom: 0, left: 0, right: 12, top: 4 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                type="number"
              />
              <YAxis
                axisLine={false}
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickFormatter={(value: string) => truncate(value)}
                tickLine={false}
                type="category"
                width={104}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => [
                      typeof value === 'number'
                        ? value.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })
                        : value,
                      ` ${t('billed_credits')}`,
                    ]}
                  />
                }
              />
              <Bar
                dataKey="credits"
                fill="var(--color-credits)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <StudioEmptyState
            className="min-h-56"
            description={t('empty_description')}
            icon={Cpu}
            title={t('empty_title')}
          />
        )}
      </SectionCard>
    </div>
  );
}

function truncate(value: string, max = 16) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
