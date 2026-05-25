'use client';

import { cn, getCurrencyLocale } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import type { ChartInterval } from '../../../../hooks/use-analytics-filters';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../chart';
import { Skeleton } from '../../skeleton';
import {
  formatIncomeExpenseAxisDate,
  formatIncomeExpenseTooltipDate,
} from './income-expense-chart-utils';
import {
  type IncomeExpenseViewMode,
  IncomeExpenseViewModeControl,
} from './income-expense-view-mode-control';

interface IncomeExpenseData {
  day: string;
  total_income: number;
  total_expense: number;
}

interface IncomeExpenseChartProps {
  data: IncomeExpenseData[];
  isLoading: boolean;
  error?: Error | null;
  currency?: string;
  title: string;
  interval: ChartInterval;
  includeConfidential?: boolean;
  className?: string;
}

export function IncomeExpenseChart({
  data,
  isLoading,
  error,
  currency = 'USD',
  title,
  interval,
  includeConfidential = true,
  className,
}: IncomeExpenseChartProps) {
  const locale = useLocale();
  const t = useTranslations('transaction-data-table');
  const analyticsT = useTranslations('finance-analytics');
  const [viewMode, setViewMode] = useState<IncomeExpenseViewMode>('all');

  const incomeColor = 'var(--chart-2)';
  const expenseColor = 'var(--chart-5)';

  const formatValue = (value: number) => {
    if (!includeConfidential) return '•••••';
    return new Intl.NumberFormat(getCurrencyLocale(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (!includeConfidential) return '•••';
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-80 items-center justify-center">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-75 items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {error.message || analyticsT('failed-to-load-data')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-75 items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {analyticsT('no-data')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((item) => ({
    date: item.day,
    income: Number(item.total_income) || 0,
    expense: Number(item.total_expense) || 0,
  }));

  const chartConfig = {
    income: {
      label: t('income'),
      color: incomeColor,
    },
    expense: {
      label: t('expense'),
      color: expenseColor,
    },
  } satisfies ChartConfig;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          <IncomeExpenseViewModeControl
            labels={{
              all: t('all'),
              expense: t('expense'),
              income: t('income'),
            }}
            onViewModeChange={setViewMode}
            viewMode={viewMode}
          />
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) =>
                formatIncomeExpenseAxisDate(String(value), interval, locale)
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) =>
                typeof value === 'number' ? formatCompactValue(value) : value
              }
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              width={60}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
              iconSize={12}
            />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" />}
              labelFormatter={(value) =>
                formatIncomeExpenseTooltipDate(String(value), interval, locale)
              }
              formatter={(value, name) => {
                const formattedValue =
                  typeof value === 'number' ? formatValue(value) : value;

                return [
                  <span
                    key={String(name)}
                    style={{
                      color: name === t('income') ? incomeColor : expenseColor,
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    {formattedValue}
                  </span>,
                  name,
                ];
              }}
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
            />
            {(viewMode === 'all' || viewMode === 'income') && (
              <Bar
                dataKey="income"
                fill="var(--color-income)"
                name={t('income')}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
            {(viewMode === 'all' || viewMode === 'expense') && (
              <Bar
                dataKey="expense"
                fill="var(--color-expense)"
                name={t('expense')}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
