'use client';

import { useQuery } from '@tanstack/react-query';
import { listFinanceIncomeExpenseSummary } from '@tuturuuu/internal-api/finance';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import { Skeleton } from '../../../skeleton';
import {
  IncomeExpenseChartControls,
  type IncomeExpenseViewMode,
} from './chart-header-controls';
import {
  FINANCE_HIDDEN_AMOUNT,
  FINANCE_HIDDEN_COMPACT_AMOUNT,
  useFinanceConfidentialVisibility,
} from './use-finance-confidential-visibility';

interface MonthlyTotalChartClientProps {
  wsId: string;
  currency?: string;
  className?: string;
  includeConfidential?: boolean;
}

export function MonthlyTotalChartClient({
  wsId,
  currency = 'USD',
  className,
  includeConfidential = true,
}: MonthlyTotalChartClientProps) {
  const locale = useLocale();
  const t = useTranslations('transaction-data-table');
  const analyticsT = useTranslations('finance-analytics');
  const [viewMode, setViewMode] = useState<IncomeExpenseViewMode>('all');
  const { isConfidential, toggleConfidential } =
    useFinanceConfidentialVisibility();
  const shouldHideAmounts = isConfidential || !includeConfidential;
  const [dateOffset, setDateOffset] = useState(0);

  const incomeColor = 'var(--chart-2)';
  const expenseColor = 'var(--chart-5)';
  const rangeDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: locale === 'vi' ? 'numeric' : 'short',
        year: 'numeric',
      }),
    [locale]
  );

  // Calculate date range based on offset (12-month windows)
  const dateRange = useMemo(() => {
    const endDate = dayjs()
      .subtract(dateOffset * 12, 'months')
      .endOf('month');
    const startDate = endDate.subtract(11, 'months').startOf('month');
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      displayStart: rangeDateFormatter.format(startDate.toDate()),
      displayEnd: rangeDateFormatter.format(endDate.toDate()),
    };
  }, [dateOffset, rangeDateFormatter]);

  const { data: summary, isLoading } = useQuery({
    queryKey: [
      'monthly-chart',
      wsId,
      dateRange.startDate,
      dateRange.endDate,
      includeConfidential,
    ],
    queryFn: () =>
      listFinanceIncomeExpenseSummary(wsId, {
        interval: 'monthly',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        includeConfidential,
      }),
  });

  const data = summary?.data ?? [];
  const openingBalance = summary?.opening_balance;
  const closingBalance = summary?.closing_balance;

  const formatValue = (value: number) => {
    if (shouldHideAmounts) return FINANCE_HIDDEN_AMOUNT;
    return new Intl.NumberFormat(getCurrencyLocale(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (shouldHideAmounts) return FINANCE_HIDDEN_COMPACT_AMOUNT;
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const chartTitle = t('monthly_total_from_12_recent_months');
  const header = (
    <CardHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base sm:text-lg">{chartTitle}</CardTitle>
        <IncomeExpenseChartControls
          canGoNext={dateOffset > 0}
          chartLabel={chartTitle}
          isConfidential={isConfidential}
          onNextPeriod={() => setDateOffset((d) => Math.max(0, d - 1))}
          onPreviousPeriod={() => setDateOffset((d) => d + 1)}
          onToggleConfidential={toggleConfidential}
          onViewModeChange={setViewMode}
          rangeLabel={`${dateRange.displayStart} - ${dateRange.displayEnd}`}
          viewMode={viewMode}
        />
      </div>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card className={cn('flex flex-col', className)}>
        {header}
        <CardContent className="flex h-80 items-center justify-center">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        {header}
        <CardContent className="flex h-75 items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {analyticsT('no-data')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(
    (item: {
      period: string;
      total_income: number;
      total_expense: number;
    }) => ({
      month: item.period,
      income: Number(item.total_income) || 0,
      expense: Number(item.total_expense) || 0,
    })
  );

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
      {header}
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <BarChart data={chartData}>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => {
                try {
                  return Intl.DateTimeFormat(locale, {
                    month: locale === 'vi' ? 'numeric' : 'short',
                    year: 'numeric',
                  }).format(new Date(value));
                } catch {
                  return value;
                }
              }}
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
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
              wrapperStyle={{
                paddingTop: '20px',
              }}
              iconType="rect"
              iconSize={12}
            />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" />}
              labelFormatter={(value) => {
                try {
                  return Intl.DateTimeFormat(locale, {
                    month: 'long',
                    year: 'numeric',
                  }).format(new Date(String(value ?? '')));
                } catch {
                  return value;
                }
              }}
              formatter={(value, name) => {
                const formattedValue =
                  typeof value === 'number' ? formatValue(value) : value;

                return [
                  <span
                    key={name}
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
                minPointSize={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
            {(viewMode === 'all' || viewMode === 'expense') && (
              <Bar
                dataKey="expense"
                fill="var(--color-expense)"
                name={t('expense')}
                minPointSize={1}
                radius={[4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
            {openingBalance !== undefined && !shouldHideAmounts && (
              <ReferenceLine
                y={openingBalance}
                stroke="hsl(var(--primary))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: t('opening_balance'),
                  position: 'insideTopLeft',
                  fill: 'hsl(var(--primary))',
                  fontSize: 12,
                }}
              />
            )}
            {closingBalance !== undefined && !shouldHideAmounts && (
              <ReferenceLine
                y={closingBalance}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: t('closing_balance'),
                  position: 'insideBottomLeft',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 12,
                }}
              />
            )}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
