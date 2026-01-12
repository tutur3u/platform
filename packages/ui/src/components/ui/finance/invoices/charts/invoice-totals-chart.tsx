'use client';

import { Eye, EyeOff } from '@tuturuuu/icons';
import type {
  InvoiceAnalyticsMetric,
  InvoiceAnalyticsPeriod,
  InvoiceTotalsByPeriod,
} from '@tuturuuu/types/primitives/Invoice';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import { Skeleton } from '../../../skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../../tabs';

// Re-export types for convenience
export type {
  InvoiceTotalsByPeriod,
  InvoiceAnalyticsPeriod,
  InvoiceAnalyticsMetric,
};

// Cookie helper functions
const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance confidential mode state persistence
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

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

// Generate consistent colors for wallets based on index
const WALLET_COLORS = [
  { light: '#2563eb', dark: '#3b82f6' }, // Blue
  { light: '#16a34a', dark: '#4ade80' }, // Green
  { light: '#dc2626', dark: '#f87171' }, // Red
  { light: '#9333ea', dark: '#a855f7' }, // Purple
  { light: '#ea580c', dark: '#fb923c' }, // Orange
  { light: '#0891b2', dark: '#22d3ee' }, // Cyan
  { light: '#be185d', dark: '#f472b6' }, // Pink
  { light: '#4d7c0f', dark: '#a3e635' }, // Lime
];

interface InvoiceTotalsChartProps {
  dailyData: InvoiceTotalsByPeriod[];
  weeklyData: InvoiceTotalsByPeriod[];
  monthlyData: InvoiceTotalsByPeriod[];
  className?: string;
}

export function InvoiceTotalsChart({
  dailyData,
  weeklyData,
  monthlyData,
  className,
}: InvoiceTotalsChartProps) {
  const locale = useLocale();
  const t = useTranslations('invoice-analytics');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [period, setPeriod] = useState<InvoiceAnalyticsPeriod>('daily');
  const [metric, setMetric] = useState<InvoiceAnalyticsMetric>('amount');
  const [isConfidential, setIsConfidential] = useState(true);

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

  // Get data based on selected period
  const rawData = useMemo(() => {
    switch (period) {
      case 'daily':
        return dailyData;
      case 'weekly':
        return weeklyData;
      case 'monthly':
        return monthlyData;
      default:
        return dailyData;
    }
  }, [period, dailyData, weeklyData, monthlyData]);

  // Extract unique wallets from data
  const wallets = useMemo(() => {
    const walletMap = new Map<string, string>();
    rawData.forEach((item) => {
      if (item.wallet_id && item.wallet_name) {
        walletMap.set(item.wallet_id, item.wallet_name);
      }
    });
    return Array.from(walletMap.entries()).map(([id, name]) => ({ id, name }));
  }, [rawData]);

  // Transform data for Recharts grouped bar format
  const chartData = useMemo(() => {
    const periodMap = new Map<string, Record<string, number | string>>();

    rawData.forEach((item) => {
      if (!periodMap.has(item.period)) {
        periodMap.set(item.period, { period: item.period });
      }
      const entry = periodMap.get(item.period)!;
      const value =
        metric === 'amount'
          ? Number(item.total_amount)
          : Number(item.invoice_count);
      entry[item.wallet_id] = value;
    });

    return Array.from(periodMap.values()).sort((a, b) =>
      String(a.period).localeCompare(String(b.period))
    );
  }, [rawData, metric]);

  // Build chart config for each wallet
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    wallets.forEach((wallet, index) => {
      const colorIndex = index % WALLET_COLORS.length;
      const color = isDark
        ? WALLET_COLORS[colorIndex]?.dark
        : WALLET_COLORS[colorIndex]?.light;
      config[wallet.id] = {
        label: wallet.name,
        color: color || '#888888',
      };
    });
    return config;
  }, [wallets, isDark]);

  const formatValue = (value: number) => {
    if (isConfidential && metric === 'amount') return '•••••';
    if (metric === 'count') {
      return value.toLocaleString(locale);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCompactValue = (value: number) => {
    if (isConfidential && metric === 'amount') return '•••';
    if (metric === 'count') {
      return value.toLocaleString(locale);
    }
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  };

  const formatPeriodLabel = (value: string) => {
    try {
      const date = new Date(value);
      switch (period) {
        case 'daily':
          return Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
        case 'weekly':
          return Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
        case 'monthly':
          return Intl.DateTimeFormat(locale, {
            month: locale === 'vi' ? 'numeric' : 'short',
            year: 'numeric',
          }).format(date);
        default:
          return value;
      }
    } catch {
      return value;
    }
  };

  const formatPeriodTooltip = (value: string) => {
    try {
      const date = new Date(value);
      switch (period) {
        case 'daily':
          return Intl.DateTimeFormat(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(date);
        case 'weekly': {
          const weekEnd = new Date(date);
          weekEnd.setDate(weekEnd.getDate() + 6);
          const startStr = Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
          }).format(date);
          const endStr = Intl.DateTimeFormat(locale, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(weekEnd);
          return `${startStr} - ${endStr}`;
        }
        case 'monthly':
          return Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
          }).format(date);
        default:
          return value;
      }
    } catch {
      return value;
    }
  };

  const getTitle = () => {
    switch (period) {
      case 'daily':
        return t('daily_invoice_totals');
      case 'weekly':
        return t('weekly_invoice_totals');
      case 'monthly':
        return t('monthly_invoice_totals');
      default:
        return t('invoice_analytics');
    }
  };

  // Check if there's any actual data
  const hasData =
    chartData.length > 0 &&
    wallets.length > 0 &&
    chartData.some((entry) => wallets.some((w) => (entry[w.id] as number) > 0));

  if (!hasData) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{getTitle()}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs
                value={period}
                onValueChange={(v: string) =>
                  setPeriod(v as InvoiceAnalyticsPeriod)
                }
              >
                <TabsList className="h-8">
                  <TabsTrigger value="daily" className="px-3 text-xs">
                    {t('daily')}
                  </TabsTrigger>
                  <TabsTrigger value="weekly" className="px-3 text-xs">
                    {t('weekly')}
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className="px-3 text-xs">
                    {t('monthly')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center">
          <p className="text-muted-foreground text-sm">
            {t('no_data_available')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{getTitle()}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Selector */}
            <Tabs
              value={period}
              onValueChange={(v: string) =>
                setPeriod(v as InvoiceAnalyticsPeriod)
              }
            >
              <TabsList className="h-8">
                <TabsTrigger value="daily" className="px-3 text-xs">
                  {t('daily')}
                </TabsTrigger>
                <TabsTrigger value="weekly" className="px-3 text-xs">
                  {t('weekly')}
                </TabsTrigger>
                <TabsTrigger value="monthly" className="px-3 text-xs">
                  {t('monthly')}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Metric Toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setMetric('amount')}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                  metric === 'amount'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('amount')}
              </button>
              <button
                type="button"
                onClick={() => setMetric('count')}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
                  metric === 'count'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('count')}
              </button>
            </div>

            {/* Confidential Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleConfidential}
              className="h-8 w-8 shrink-0"
              title={isConfidential ? t('show_values') : t('hide_values')}
            >
              {isConfidential ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
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
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatPeriodLabel}
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                typeof value === 'number' ? formatCompactValue(value) : value
              }
              tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
              width={60}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="rect"
              iconSize={12}
              formatter={(value: string) => {
                const wallet = wallets.find((w) => w.id === value);
                return wallet?.name || value;
              }}
            />
            <ChartTooltip
              content={<ChartTooltipContent indicator="dot" />}
              labelFormatter={formatPeriodTooltip}
              formatter={(value, name) => {
                const numValue = typeof value === 'number' ? value : 0;
                const formattedValue = formatValue(numValue);
                const wallet = wallets.find((w) => w.id === name);
                const walletName = wallet?.name || String(name);
                const colorIndex =
                  wallets.findIndex((w) => w.id === name) %
                  WALLET_COLORS.length;
                const color = isDark
                  ? WALLET_COLORS[colorIndex]?.dark
                  : WALLET_COLORS[colorIndex]?.light;

                return [
                  <span
                    key={String(name)}
                    style={{
                      color: color || '#888888',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    {formattedValue}
                  </span>,
                  walletName,
                ];
              }}
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
            />
            {wallets.map((wallet, index) => {
              const colorIndex = index % WALLET_COLORS.length;
              const color = isDark
                ? WALLET_COLORS[colorIndex]?.dark
                : WALLET_COLORS[colorIndex]?.light;
              return (
                <Bar
                  key={wallet.id}
                  dataKey={wallet.id}
                  fill={color}
                  name={wallet.id}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              );
            })}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton for the invoice totals chart
 * Matches the structure and dimensions of the actual chart
 */
export function InvoiceTotalsChartSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex flex-wrap items-center gap-2">
            {/* Period selector skeleton */}
            <Skeleton className="h-8 w-[180px] rounded-lg" />
            {/* Metric toggle skeleton */}
            <Skeleton className="h-8 w-[120px] rounded-lg" />
            {/* Confidential toggle skeleton */}
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <div className="flex h-[320px] w-full items-end justify-between gap-2 px-4 py-8">
          {/* Simulated bar chart skeleton */}
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <Skeleton
                className="w-full rounded-t"
                style={{
                  height: `${Math.random() * 150 + 50}px`,
                }}
              />
              <Skeleton className="mt-2 h-3 w-8" />
            </div>
          ))}
        </div>
        {/* Legend skeleton */}
        <div className="mt-4 flex justify-center gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
