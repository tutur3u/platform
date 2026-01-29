'use client';

import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
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

type ViewMode = 'all' | 'income' | 'expense';

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
  const { resolvedTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const incomeColor = resolvedTheme === 'dark' ? '#4ade80' : '#16a34a';
  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';

  const formatValue = (value: number) => {
    if (!includeConfidential) return '•••••';
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
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

  const formatAxisDate = (value: string) => {
    try {
      const date = new Date(value);
      if (interval === 'daily' || interval === 'weekly') {
        return format(date, 'MMM dd');
      }
      return Intl.DateTimeFormat(locale, {
        month: locale === 'vi' ? 'numeric' : 'short',
        year: 'numeric',
      }).format(date);
    } catch {
      return value;
    }
  };

  const formatTooltipDate = (value: string) => {
    try {
      const date = new Date(value);
      if (interval === 'daily' || interval === 'weekly') {
        return format(date, 'MMMM dd, yyyy');
      }
      return Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return value;
    }
  };

  if (isLoading) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[320px] items-center justify-center">
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
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {error.message || 'Failed to load data'}
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
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No data available</p>
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
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                viewMode === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('all')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('income')}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                viewMode === 'income'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('income')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('expense')}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                viewMode === 'expense'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('expense')}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
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
              tickFormatter={formatAxisDate}
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
              labelFormatter={(value) => formatTooltipDate(String(value))}
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
