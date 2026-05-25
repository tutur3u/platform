'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getFinanceBalanceAtDate,
  listFinanceDailyIncomeExpense,
} from '@tuturuuu/internal-api/finance';
import { cn, getCurrencyLocale } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../chart';
import { Skeleton } from '../../skeleton';
import {
  FINANCE_HIDDEN_AMOUNT,
  FINANCE_HIDDEN_COMPACT_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

interface BalanceTrendChartProps {
  wsId: string;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
  includeConfidential?: boolean;
  title: string;
  className?: string;
}

interface BalanceDataPoint {
  date: string;
  balance: number;
}

export function BalanceTrendChart({
  wsId,
  currency = 'USD',
  startDate,
  endDate,
  includeConfidential = true,
  title,
  className,
}: BalanceTrendChartProps) {
  const locale = useLocale();
  const walletT = useTranslations('wallet-data-table');
  const analyticsT = useTranslations('finance-analytics');
  const { isConfidential: areNumbersHidden } =
    useFinanceConfidentialVisibility();
  const shouldHideAmounts = areNumbersHidden || !includeConfidential;

  const balanceColor = 'var(--chart-1)';
  const positiveGradient = 'var(--chart-2)';
  const negativeGradient = 'var(--chart-5)';

  // Generate date points for balance calculation
  const datePoints = useMemo(() => {
    const end = endDate ? dayjs(endDate) : dayjs();
    const start = startDate ? dayjs(startDate) : end.subtract(29, 'days');
    const points: string[] = [];

    let current = start;
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      points.push(current.format('YYYY-MM-DD'));
      current = current.add(1, 'day');
    }

    // Limit to reasonable number of points (max 60)
    if (points.length > 60) {
      const step = Math.ceil(points.length / 60);
      return points.filter((_, i) => i % step === 0 || i === points.length - 1);
    }

    return points;
  }, [startDate, endDate]);

  // Fetch balance at each date point
  const {
    data: balanceData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['balance-trend', wsId, datePoints, includeConfidential],
    queryFn: async () => {
      const endBalance = await getFinanceBalanceAtDate(wsId, {
        date: datePoints.at(-1) || dayjs().format('YYYY-MM-DD'),
        includeConfidential,
      });

      // Calculate running balance backwards from end balance
      const dailyArray = await listFinanceDailyIncomeExpense(wsId, {
        endDate,
        includeConfidential,
        startDate,
      });
      const dailyMap = new Map<string, { income: number; expense: number }>();

      dailyArray.forEach(
        (item: {
          day: string;
          total_income: number;
          total_expense: number;
        }) => {
          // Normalize the date format to YYYY-MM-DD for consistent lookup
          const normalizedDay = dayjs(item.day).format('YYYY-MM-DD');
          dailyMap.set(normalizedDay, {
            income: Number(item.total_income) || 0,
            expense: Number(item.total_expense) || 0,
          });
        }
      );

      // Build balance data points
      let currentBalance = Number(endBalance.balance) || 0;
      const result: BalanceDataPoint[] = [];

      // Work backwards from the end
      for (let i = datePoints.length - 1; i >= 0; i--) {
        const date = datePoints[i];
        if (!date) continue;

        result.unshift({ date, balance: currentBalance });

        // Subtract today's net to get yesterday's ending balance
        const dayData = dailyMap.get(date);
        if (dayData) {
          currentBalance -= dayData.income - dayData.expense;
        }
      }

      return result;
    },
    staleTime: 30_000,
  });

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

  const formatChartDate = (
    value: string,
    options: Intl.DateTimeFormatOptions
  ) => {
    return new Intl.DateTimeFormat(locale, options).format(
      dayjs(value).toDate()
    );
  };

  // Determine if balance is positive or negative overall
  const isPositiveTrend = useMemo(() => {
    if (!balanceData || balanceData.length === 0) return true;
    const lastBalance = balanceData[balanceData.length - 1]?.balance || 0;
    return lastBalance >= 0;
  }, [balanceData]);

  const chartConfig = {
    balance: {
      label: walletT('balance'),
      color: balanceColor,
    },
  } satisfies ChartConfig;

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
            {error instanceof Error
              ? error.message
              : analyticsT('failed-to-load-data')}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!balanceData || balanceData.length === 0) {
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

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <span
            className={cn(
              'font-semibold text-sm',
              shouldHideAmounts
                ? 'text-muted-foreground'
                : isPositiveTrend
                  ? 'text-dynamic-green'
                  : 'text-dynamic-red'
            )}
          >
            {formatValue(balanceData[balanceData.length - 1]?.balance || 0)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <AreaChart accessibilityLayer data={balanceData}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={
                    isPositiveTrend ? positiveGradient : negativeGradient
                  }
                  stopOpacity={0.2}
                />
                <stop
                  offset="95%"
                  stopColor={
                    isPositiveTrend ? positiveGradient : negativeGradient
                  }
                  stopOpacity={0.04}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.3}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => {
                try {
                  return formatChartDate(value, {
                    day: 'numeric',
                    month: 'short',
                  });
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
            <ChartTooltip
              content={<ChartTooltipContent indicator="line" />}
              labelFormatter={(value) => {
                try {
                  return formatChartDate(String(value), {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
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
                      color: balanceColor,
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    {formattedValue}
                  </span>,
                  walletT('balance'),
                ];
              }}
              cursor={{
                stroke: 'hsl(var(--muted-foreground))',
                strokeWidth: 1,
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={balanceColor}
              strokeWidth={2}
              fill="url(#balanceGradient)"
              name={walletT('balance')}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
