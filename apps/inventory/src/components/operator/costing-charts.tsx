'use client';

import type { InventoryCostingAnalytics } from '@tuturuuu/internal-api/inventory';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@tuturuuu/ui/chart';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const marginConfig = {
  margin: {
    color: 'var(--chart-1)',
    label: 'Margin',
  },
} satisfies ChartConfig;

const breakEvenConfig = {
  breakEven: {
    color: 'var(--chart-2)',
    label: 'Break-even',
  },
} satisfies ChartConfig;

export function CostingCharts({
  analytics,
}: {
  analytics?: InventoryCostingAnalytics;
}) {
  const t = useTranslations('inventory.operator.costing');
  const scenarios =
    analytics?.scenarios.map((scenario) => ({
      breakEven: scenario.breakEvenQuantity ?? 0,
      label: `${scenario.profileName} ${scenario.batchSize}`,
      margin: scenario.grossMarginPercentage,
    })) ?? [];

  if (scenarios.length === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-medium text-sm">{t('marginChart')}</h2>
          <p className="text-muted-foreground text-xs">{t('scenarios')}</p>
        </div>
        <ChartContainer className="mt-4 h-64 w-full" config={marginConfig}>
          <BarChart data={scenarios}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tickMargin={8}
            />
            <YAxis axisLine={false} tickLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="margin" fill="var(--color-margin)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-medium text-sm">{t('breakEvenChart')}</h2>
          <p className="text-muted-foreground text-xs">{t('scenarios')}</p>
        </div>
        <ChartContainer className="mt-4 h-64 w-full" config={breakEvenConfig}>
          <BarChart data={scenarios}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tickMargin={8}
            />
            <YAxis axisLine={false} tickLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="breakEven" fill="var(--color-breakEven)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>
    </div>
  );
}
