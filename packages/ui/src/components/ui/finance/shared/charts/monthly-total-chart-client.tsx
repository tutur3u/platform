'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import { Skeleton } from '../../../skeleton';

// Cookie helper functions
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance confidential mode state persistence
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

type ViewMode = 'all' | 'income' | 'expense';

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
  const { resolvedTheme } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [isConfidential, setIsConfidential] = useState(true);
  const [dateOffset, setDateOffset] = useState(0);

  const incomeColor = resolvedTheme === 'dark' ? '#4ade80' : '#16a34a';
  const expenseColor = resolvedTheme === 'dark' ? '#f87171' : '#dc2626';

  // Calculate date range based on offset (12-month windows)
  const dateRange = useMemo(() => {
    const endDate = dayjs()
      .subtract(dateOffset * 12, 'months')
      .endOf('month');
    const startDate = endDate.subtract(11, 'months').startOf('month');
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      displayStart: startDate.format('MMM YYYY'),
      displayEnd: endDate.format('MMM YYYY'),
    };
  }, [dateOffset]);

  // Fetch chart data
  const { data: chartResponse, isLoading } = useQuery({
    queryKey: [
      'monthly-chart',
      wsId,
      dateRange.startDate,
      dateRange.endDate,
      includeConfidential,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        includeConfidential: String(includeConfidential),
      });
      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/monthly?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch monthly chart data');
      return res.json();
    },
  });

  // Fetch opening balance (balance at start of period)
  const { data: openingBalanceRes } = useQuery({
    queryKey: [
      'monthly-opening-balance',
      wsId,
      dateRange.startDate,
      includeConfidential,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: dateRange.startDate,
        includeConfidential: String(includeConfidential),
      });
      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/balance?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch opening balance');
      return res.json();
    },
  });

  // Fetch closing balance (balance at end of period)
  const { data: closingBalanceRes } = useQuery({
    queryKey: [
      'monthly-closing-balance',
      wsId,
      dateRange.endDate,
      includeConfidential,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: dateRange.endDate,
        includeConfidential: String(includeConfidential),
      });
      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/balance?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch closing balance');
      return res.json();
    },
  });

  const data = chartResponse?.data || [];
  const openingBalance = openingBalanceRes?.balance;
  const closingBalance = closingBalanceRes?.balance;

  // Load confidential mode from cookie on mount
  useEffect(() => {
    const saved = getCookie('finance-confidential-mode');
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    const handleStorageChange = () => {
      const newValue = getCookie('finance-confidential-mode');
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    window.addEventListener(
      'finance-confidential-mode-change',
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'finance-confidential-mode-change',
        handleStorageChange as EventListener
      );
    };
  }, []);

  const toggleConfidential = () => {
    const newValue = !isConfidential;
    setIsConfidential(newValue);
    setCookie('finance-confidential-mode', String(newValue));
    window.dispatchEvent(new Event('finance-confidential-mode-change'));
  };

  const formatValue = (value: number) => {
    if (isConfidential) return '•••••';
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (isConfidential) return '•••';
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
          <CardTitle>{t('monthly_total_from_12_recent_months')}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[320px] items-center justify-center">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <CardTitle>{t('monthly_total_from_12_recent_months')}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(
    (item: { month: string; total_income: number; total_expense: number }) => ({
      month: item.month,
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
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">
            {t('monthly_total_from_12_recent_months')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Time navigation */}
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDateOffset((d) => d + 1)}
                className="h-7 w-7"
                title="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] px-2 text-center text-xs">
                {dateRange.displayStart} - {dateRange.displayEnd}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDateOffset((d) => Math.max(0, d - 1))}
                disabled={dateOffset === 0}
                className="h-7 w-7"
                title="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleConfidential}
              className="h-8 w-8 shrink-0"
              title={
                isConfidential ? t('show_confidential') : t('hide_confidential')
              }
            >
              {isConfidential ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>

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
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
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
                  }).format(new Date(value));
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
            {openingBalance !== undefined && !isConfidential && (
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
            {closingBalance !== undefined && !isConfidential && (
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
