'use client';

import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../ui/chart';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';

export function MonthlyTotalChart({
  data,
  className,
}: {
  data: { month: string; total_income: number; total_expense: number }[];
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('transaction-data-table');

  const chartConfig = {
    desktop: {
      label: t('income'),
      color: 'hsl(var(--chart-1))',
    },
    mobile: {
      label: t('expense'),
      color: 'hsl(var(--chart-2))',
    },
  } satisfies ChartConfig;

  return (
    <Card
      className={cn(
        'flex flex-col items-center justify-center gap-2 overflow-x-auto text-center',
        className
      )}
    >
      <CardHeader>
        <CardTitle>{t('monthly_total_from_12_recent_months')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <BarChart data={data} width={data.length * 100} height={300}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(value) =>
                Intl.DateTimeFormat(locale, {
                  month: locale === 'vi' ? 'numeric' : 'short',
                  year: 'numeric',
                }).format(new Date(value))
              }
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
            />
            <YAxis
              tickFormatter={(value) =>
                typeof value === 'number'
                  ? Intl.NumberFormat(locale, {
                      style: 'decimal',
                      notation: 'compact',
                    }).format(value)
                  : value
              }
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
            />
            <Legend />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dashed" />}
              labelFormatter={(value) =>
                Intl.DateTimeFormat(locale, {
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(value))
              }
              formatter={(value, name) => (
                <span
                  className={cn(
                    name === t('income')
                      ? 'text-dynamic-green'
                      : 'text-dynamic-red'
                  )}
                >
                  {typeof value === 'number'
                    ? Intl.NumberFormat(locale, { style: 'decimal' }).format(
                        value
                      )
                    : value}
                </span>
              )}
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.1 }}
            />
            <Bar
              dataKey="total_income"
              fill="hsl(var(--green))"
              name={t('income')}
              minPointSize={1}
            />
            <Bar
              dataKey="total_expense"
              fill="hsl(var(--red))"
              name={t('expense')}
              minPointSize={1}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
