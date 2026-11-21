'use client';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyCostRow } from '@/lib/admin-costs/trends';
import { CostSection, SectionMessage } from './cost-section';
import { dailyByProvider, type Section } from './cost-view';

// Theme chart tokens, cycled per provider.
const CHART_TOKENS = [1, 2, 3, 4, 5].map((index) => `var(--chart-${index})`);

export function CostTrendChart({ daily }: { daily: Section<DailyCostRow[]> }) {
  const t = useTranslations('infrastructure-costs');
  const series = useMemo(
    () => (daily.kind === 'ok' ? dailyByProvider(daily.data) : null),
    [daily]
  );
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        (series?.providers ?? []).map((provider, index) => [
          provider,
          {
            color: CHART_TOKENS[index % CHART_TOKENS.length],
            label: provider,
          },
        ])
      ),
    [series]
  );

  return (
    <CostSection title={t('trend.title')}>
      {series === null ? (
        <SectionMessage tone="error">{t('section_unavailable')}</SectionMessage>
      ) : series.points.length === 0 ? (
        <SectionMessage>{t('trend.empty')}</SectionMessage>
      ) : (
        <div
          className="px-2 py-4 md:px-4"
          role="img"
          aria-label={t('trend.label')}
        >
          <ChartContainer config={config} className="h-64 w-full">
            {/* Signed stacking keeps credits below the zero line instead of
                overlapping another provider's charges. */}
            <BarChart
              data={series.points}
              stackOffset="sign"
              accessibilityLayer={false}
            >
              <CartesianGrid vertical={false} className="stroke-muted" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickFormatter={(day: string) => day.slice(5)}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <ReferenceLine y={0} className="stroke-border" />
              <ChartTooltip content={<ChartTooltipContent />} />
              {series.providers.map((provider) => (
                <Bar
                  key={provider}
                  dataKey={provider}
                  stackId="billed"
                  fill={`var(--color-${provider})`}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </CostSection>
  );
}
