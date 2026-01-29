'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LegendPayload } from 'recharts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import { ChartContainer } from '../../../chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../select';
import { Skeleton } from '../../../skeleton';
import { ToggleGroup, ToggleGroupItem } from '../../../toggle-group';

type TransactionType = 'expense' | 'income';
type ChartInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

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

// Default color palette for categories without custom colors
const DEFAULT_CATEGORY_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#0088FE',
  '#00C49F',
  '#a855f7',
  '#ec4899',
  '#f97316',
];

interface CategoryBreakdownData {
  period: string;
  category_id: string | null;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  total: number;
}

interface CategoryBreakdownChartProps {
  wsId: string;
  currency?: string;
  className?: string;
  includeConfidential?: boolean;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  locale: string;
  interval: ChartInterval;
  formatValue: (value: number) => string;
  categories: Array<{ id: string | null; name: string; color: string }>;
  hiddenCategories: Set<string>;
}

function CustomTooltipContent({
  active,
  payload,
  label,
  locale,
  interval,
  formatValue,
  categories,
  hiddenCategories,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Filter out hidden categories and sort by value (highest to lowest)
  const sortedPayload = [...payload]
    .filter((item) => !hiddenCategories.has(item.name))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  if (sortedPayload.length === 0) return null;

  // Format the label based on interval
  let formattedLabel = label;
  try {
    const date = new Date(label || '');
    switch (interval) {
      case 'daily':
        formattedLabel = Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date);
        break;
      case 'weekly':
        formattedLabel = `Week of ${Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date)}`;
        break;
      case 'monthly':
        formattedLabel = Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
        }).format(date);
        break;
      case 'yearly':
        formattedLabel = Intl.DateTimeFormat(locale, {
          year: 'numeric',
        }).format(date);
        break;
    }
  } catch {
    // Use original label if formatting fails
  }

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl">
      <p className="mb-2 font-semibold">{formattedLabel}</p>
      <div className="space-y-1">
        {sortedPayload.map((item) => {
          const category = categories.find((c) => c.name === item.name);
          return (
            <div
              key={item.name}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: category?.color || item.color }}
                />
                <span className="text-sm">{item.name}</span>
              </div>
              <span
                className="font-semibold text-sm"
                style={{ color: category?.color || item.color }}
              >
                {formatValue(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryBreakdownChart({
  wsId,
  currency = 'USD',
  className,
  includeConfidential = true,
}: CategoryBreakdownChartProps) {
  const locale = useLocale();
  const t = useTranslations();
  const [isConfidential, setIsConfidential] = useState(true);
  const [dateOffset, setDateOffset] = useState(0);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set()
  );
  const [transactionType, setTransactionType] =
    useState<TransactionType>('expense');
  const [interval, setInterval] = useState<ChartInterval>('monthly');

  // Calculate date range based on offset and interval
  const dateRange = useMemo(() => {
    let endDate: dayjs.Dayjs;
    let startDate: dayjs.Dayjs;
    let displayStart: string;
    let displayEnd: string;

    switch (interval) {
      case 'daily':
        // 30-day windows
        endDate = dayjs()
          .subtract(dateOffset * 30, 'days')
          .endOf('day');
        startDate = endDate.subtract(29, 'days').startOf('day');
        displayStart = startDate.format('MMM D');
        displayEnd = endDate.format('MMM D, YYYY');
        break;
      case 'weekly':
        // 12-week windows
        endDate = dayjs()
          .subtract(dateOffset * 12, 'weeks')
          .endOf('week');
        startDate = endDate.subtract(11, 'weeks').startOf('week');
        displayStart = startDate.format('MMM D');
        displayEnd = endDate.format('MMM D, YYYY');
        break;
      case 'monthly':
        // 12-month windows
        endDate = dayjs()
          .subtract(dateOffset * 12, 'months')
          .endOf('month');
        startDate = endDate.subtract(11, 'months').startOf('month');
        displayStart = startDate.format('MMM YYYY');
        displayEnd = endDate.format('MMM YYYY');
        break;
      case 'yearly':
        // 5-year windows
        endDate = dayjs()
          .subtract(dateOffset * 5, 'years')
          .endOf('year');
        startDate = endDate.subtract(4, 'years').startOf('year');
        displayStart = startDate.format('YYYY');
        displayEnd = endDate.format('YYYY');
        break;
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      displayStart,
      displayEnd,
    };
  }, [dateOffset, interval]);

  // Reset hidden categories when transaction type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally only reset on transactionType change
  useEffect(() => {
    setHiddenCategories(new Set());
  }, [transactionType]);

  // Reset date offset when interval changes to start fresh with latest data
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally only reset on interval change
  useEffect(() => {
    setDateOffset(0);
  }, [interval]);

  // When dateOffset is 0, anchor to the latest transaction to ensure data is always shown
  const anchorToLatest = dateOffset === 0;

  // Fetch category breakdown data
  const { data: response, isLoading } = useQuery({
    queryKey: [
      'category-breakdown',
      wsId,
      anchorToLatest ? 'latest' : dateRange.startDate,
      anchorToLatest ? 'latest' : dateRange.endDate,
      includeConfidential,
      transactionType,
      interval,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        includeConfidential: String(includeConfidential),
        transactionType,
        interval,
        anchorToLatest: String(anchorToLatest),
      });
      // Only pass explicit dates when not anchoring to latest
      if (!anchorToLatest) {
        params.set('startDate', dateRange.startDate);
        params.set('endDate', dateRange.endDate);
      }
      const res = await fetch(
        `/api/workspaces/${wsId}/finance/charts/categories?${params}`
      );
      if (!res.ok) throw new Error('Failed to fetch category breakdown');
      return res.json();
    },
  });

  const rawData: CategoryBreakdownData[] = response?.data || [];

  // Compute actual display range from data when anchoring to latest
  const actualDisplayRange = useMemo(() => {
    if (!anchorToLatest || rawData.length === 0) {
      return {
        displayStart: dateRange.displayStart,
        displayEnd: dateRange.displayEnd,
      };
    }

    // Get actual date range from the data
    const periods = rawData.map((d) => new Date(d.period).getTime());
    const minDate = dayjs(Math.min(...periods));
    const maxDate = dayjs(Math.max(...periods));

    let displayStart: string;
    let displayEnd: string;

    switch (interval) {
      case 'daily':
        displayStart = minDate.format('MMM D');
        displayEnd = maxDate.format('MMM D, YYYY');
        break;
      case 'weekly':
        displayStart = minDate.format('MMM D');
        displayEnd = maxDate.format('MMM D, YYYY');
        break;
      case 'monthly':
        displayStart = minDate.format('MMM YYYY');
        displayEnd = maxDate.format('MMM YYYY');
        break;
      case 'yearly':
        displayStart = minDate.format('YYYY');
        displayEnd = maxDate.format('YYYY');
        break;
    }

    return { displayStart, displayEnd };
  }, [anchorToLatest, rawData, dateRange, interval]);

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

  // Handle legend click to toggle category visibility
  const handleLegendClick = useCallback((entry: LegendPayload) => {
    const categoryName = entry.value as string;
    setHiddenCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  }, []);

  // Transform data: pivot by period, stack by category
  const { chartData, categories } = useMemo(() => {
    if (!rawData || rawData.length === 0) {
      return { chartData: [], categories: [] };
    }

    // Get unique categories and their colors
    const categoryMap = new Map<
      string,
      { id: string | null; name: string; color: string }
    >();
    let colorIndex = 0;

    rawData.forEach((item) => {
      const key = item.category_id || 'uncategorized';
      if (!categoryMap.has(key)) {
        const color =
          item.category_color ||
          DEFAULT_CATEGORY_COLORS[colorIndex % DEFAULT_CATEGORY_COLORS.length];
        categoryMap.set(key, {
          id: item.category_id,
          name: item.category_name,
          color: color ?? DEFAULT_CATEGORY_COLORS[0]!,
        });
        colorIndex++;
      }
    });

    const categories = Array.from(categoryMap.values());

    // Get unique periods and create data points
    const periodMap = new Map<string, Record<string, string | number>>();

    rawData.forEach((item) => {
      const periodKey = item.period;
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, { period: periodKey });
      }
      const periodData = periodMap.get(periodKey)!;
      // Use category name as the key for the bar
      periodData[item.category_name] = Number(item.total) || 0;
    });

    // Sort periods chronologically
    const chartData = Array.from(periodMap.values()).sort((a, b) => {
      const periodA = a.period;
      const periodB = b.period;
      if (typeof periodA !== 'string' || typeof periodB !== 'string') return 0;
      return new Date(periodA).getTime() - new Date(periodB).getTime();
    });

    return { chartData, categories };
  }, [rawData]);

  const formatValue = useCallback(
    (value: number) => {
      if (isConfidential) return '•••••';
      return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    },
    [isConfidential, currency]
  );

  const formatCompactValue = useCallback(
    (value: number) => {
      if (isConfidential) return '•••';
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        compactDisplay: 'short',
        maximumFractionDigits: 1,
      }).format(value);
    },
    [isConfidential, locale]
  );

  // Create dynamic chart config from categories
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    categories.forEach((cat) => {
      config[cat.name] = {
        label: cat.name,
        color: cat.color,
      };
    });
    return config;
  }, [categories]);

  // Format x-axis tick based on interval
  const formatXAxisTick = useCallback(
    (value: string) => {
      try {
        const date = new Date(value);
        switch (interval) {
          case 'daily':
            return Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: locale === 'vi' ? 'numeric' : 'short',
            }).format(date);
          case 'weekly':
            return Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: locale === 'vi' ? 'numeric' : 'short',
            }).format(date);
          case 'monthly':
            return Intl.DateTimeFormat(locale, {
              month: locale === 'vi' ? 'numeric' : 'short',
              year: 'numeric',
            }).format(date);
          case 'yearly':
            return Intl.DateTimeFormat(locale, {
              year: 'numeric',
            }).format(date);
        }
      } catch {
        return value;
      }
    },
    [interval, locale]
  );

  // Get interval label for translations
  const intervalLabels: Record<ChartInterval, string> = useMemo(
    () => ({
      daily: t('finance-analytics.daily'),
      weekly: t('finance-analytics.weekly'),
      monthly: t('finance-analytics.monthly'),
      yearly: t('finance-analytics.yearly'),
    }),
    [t]
  );

  // Custom legend renderer with click handler and visual feedback
  const renderLegend = useCallback(
    (props: { payload?: readonly LegendPayload[] }) => {
      const { payload } = props;
      if (!payload) return null;

      return (
        <div className="flex flex-wrap justify-center gap-3 pt-5">
          {payload.map((entry) => {
            const isHidden = hiddenCategories.has(entry.value as string);
            return (
              <button
                key={String(entry.value)}
                type="button"
                onClick={() => handleLegendClick(entry)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm transition-all hover:bg-accent',
                  isHidden && 'opacity-40'
                )}
              >
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: entry.color,
                    opacity: isHidden ? 0.4 : 1,
                  }}
                />
                <span
                  className={cn(isHidden && 'line-through')}
                  style={{ color: 'hsl(var(--foreground))' }}
                >
                  {entry.value}
                </span>
              </button>
            );
          })}
        </div>
      );
    },
    [hiddenCategories, handleLegendClick]
  );

  // Get the chart title based on transaction type
  // This must be defined BEFORE any conditional returns to follow React's rules of hooks
  const chartTitle = useMemo(() => {
    if (transactionType === 'income') {
      return t('finance-overview.income-by-category');
    }
    return t('finance-overview.spending-by-category');
  }, [transactionType, t]);

  if (isLoading) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <CardTitle className="text-base sm:text-lg">
                {chartTitle}
              </CardTitle>
              <ToggleGroup
                type="single"
                value={transactionType}
                onValueChange={(value) => {
                  if (value) setTransactionType(value as TransactionType);
                }}
                className="h-8"
              >
                <ToggleGroupItem
                  value="expense"
                  aria-label={t('transaction-data-table.expense')}
                  className="h-7 px-3 text-xs"
                >
                  {t('transaction-data-table.expense')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="income"
                  aria-label={t('transaction-data-table.income')}
                  className="h-7 px-3 text-xs"
                >
                  {t('transaction-data-table.income')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Select
              value={interval}
              onValueChange={(value) => setInterval(value as ChartInterval)}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{intervalLabels.daily}</SelectItem>
                <SelectItem value="weekly">{intervalLabels.weekly}</SelectItem>
                <SelectItem value="monthly">
                  {intervalLabels.monthly}
                </SelectItem>
                <SelectItem value="yearly">{intervalLabels.yearly}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="flex h-[320px] items-center justify-center">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!rawData || rawData.length === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <CardTitle className="text-base sm:text-lg">
                {chartTitle}
              </CardTitle>
              <ToggleGroup
                type="single"
                value={transactionType}
                onValueChange={(value) => {
                  if (value) setTransactionType(value as TransactionType);
                }}
                className="h-8"
              >
                <ToggleGroupItem
                  value="expense"
                  aria-label={t('transaction-data-table.expense')}
                  className="h-7 px-3 text-xs"
                >
                  {t('transaction-data-table.expense')}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="income"
                  aria-label={t('transaction-data-table.income')}
                  className="h-7 px-3 text-xs"
                >
                  {t('transaction-data-table.income')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <Select
              value={interval}
              onValueChange={(value) => setInterval(value as ChartInterval)}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{intervalLabels.daily}</SelectItem>
                <SelectItem value="weekly">{intervalLabels.weekly}</SelectItem>
                <SelectItem value="monthly">
                  {intervalLabels.monthly}
                </SelectItem>
                <SelectItem value="yearly">{intervalLabels.yearly}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <CardTitle className="text-base sm:text-lg">{chartTitle}</CardTitle>
            {/* Expense/Income toggle */}
            <ToggleGroup
              type="single"
              value={transactionType}
              onValueChange={(value) => {
                if (value) setTransactionType(value as TransactionType);
              }}
              className="h-8"
            >
              <ToggleGroupItem
                value="expense"
                aria-label={t('transaction-data-table.expense')}
                className="h-7 px-3 text-xs"
              >
                {t('transaction-data-table.expense')}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="income"
                aria-label={t('transaction-data-table.income')}
                className="h-7 px-3 text-xs"
              >
                {t('transaction-data-table.income')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Interval selector */}
            <Select
              value={interval}
              onValueChange={(value) => setInterval(value as ChartInterval)}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{intervalLabels.daily}</SelectItem>
                <SelectItem value="weekly">{intervalLabels.weekly}</SelectItem>
                <SelectItem value="monthly">
                  {intervalLabels.monthly}
                </SelectItem>
                <SelectItem value="yearly">{intervalLabels.yearly}</SelectItem>
              </SelectContent>
            </Select>

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
                {actualDisplayRange.displayStart} -{' '}
                {actualDisplayRange.displayEnd}
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
                isConfidential
                  ? t('transaction-data-table.show_confidential')
                  : t('transaction-data-table.hide_confidential')
              }
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
              tickFormatter={formatXAxisTick}
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
            <Legend content={renderLegend} iconType="rect" iconSize={12} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
              wrapperStyle={{
                outline: 'none',
                zIndex: 100,
              }}
              contentStyle={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: 0,
                boxShadow: 'none',
              }}
              content={
                <CustomTooltipContent
                  locale={locale}
                  interval={interval}
                  formatValue={formatValue}
                  categories={categories}
                  hiddenCategories={hiddenCategories}
                />
              }
            />
            {categories.map((category) => (
              <Bar
                key={category.id || 'uncategorized'}
                dataKey={category.name}
                stackId="categories"
                fill={
                  hiddenCategories.has(category.name)
                    ? 'transparent'
                    : category.color
                }
                radius={[0, 0, 0, 0]}
                maxBarSize={50}
                hide={hiddenCategories.has(category.name)}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
