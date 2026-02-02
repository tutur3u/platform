'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
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
  const t = useTranslations('wallet-data-table');
  const { resolvedTheme } = useTheme();

  const balanceColor = resolvedTheme === 'dark' ? '#60a5fa' : '#3b82f6';
  const positiveGradient = resolvedTheme === 'dark' ? '#4ade8020' : '#16a34a20';
  const negativeGradient = resolvedTheme === 'dark' ? '#f8717120' : '#dc262620';

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
      // Fetch balance at start and end, then interpolate from daily data
      const params = new URLSearchParams({
        date: datePoints[datePoints.length - 1] || dayjs().format('YYYY-MM-DD'),
        includeConfidential: String(includeConfidential),
      });

      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/balance?${params}`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch balance');
      }
      const endBalance = await res.json();

      // Fetch daily data to calculate running balance
      const dailyParams = new URLSearchParams();
      if (startDate) dailyParams.set('startDate', startDate);
      if (endDate) dailyParams.set('endDate', endDate);
      dailyParams.set('includeConfidential', String(includeConfidential));

      const dailyRes = await fetch(
        `/api/workspaces/${wsId}/finance/charts/daily?${dailyParams}`
      );
      if (!dailyRes.ok) {
        const errorData = await dailyRes.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch daily data');
      }
      const dailyData = await dailyRes.json();

      // Calculate running balance backwards from end balance
      const dailyArray = dailyData.data || [];
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

  // Determine if balance is positive or negative overall
  const isPositiveTrend = useMemo(() => {
    if (!balanceData || balanceData.length === 0) return true;
    const lastBalance = balanceData[balanceData.length - 1]?.balance || 0;
    return lastBalance >= 0;
  }, [balanceData]);

  const chartConfig = {
    balance: {
      label: t('balance') || 'Balance',
      color: balanceColor,
    },
  } satisfies ChartConfig;

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
            {error instanceof Error ? error.message : 'Failed to load data'}
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
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No data available</p>
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
              isPositiveTrend
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatValue(balanceData[balanceData.length - 1]?.balance || 0)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <AreaChart accessibilityLayer data={balanceData}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={
                    isPositiveTrend ? positiveGradient : negativeGradient
                  }
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={
                    isPositiveTrend ? positiveGradient : negativeGradient
                  }
                  stopOpacity={0.1}
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
                  return dayjs(value).format('MMM DD');
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
                  return dayjs(value).format('MMMM DD, YYYY');
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
                  t('balance') || 'Balance',
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
              name={t('balance') || 'Balance'}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
