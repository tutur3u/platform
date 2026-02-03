'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import { Skeleton } from '../../../skeleton';
import { CategoryBreakdownDialog } from './category-breakdown-dialog';

// Initialize dayjs plugins for timezone-aware date operations
dayjs.extend(utc);
dayjs.extend(timezonePlugin);

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

// Dynamic color palette using CSS variables
// NOTE: CSS variables --chart-N already contain full hsl() values (e.g., "hsl(12 76% 61%)"),
// so we use var(--chart-N) directly without wrapping in hsl()
const CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#fbbf24', // amber-400
  '#4ade80', // green-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#34d399', // emerald-400
  '#818cf8', // indigo-400
  '#fb7185', // rose-400
  '#2dd4bf', // teal-400
  '#facc15', // yellow-400
  '#c084fc', // purple-400
  '#38bdf8', // sky-400
];

interface CategoryDonutChartProps {
  transactions: Transaction[];
  currency?: string;
  className?: string;
  /** If true, show only expense categories. If false, show only income. If undefined, show all. */
  type?: 'income' | 'expense';
  /** Workspace ID for immersive dialog RPC calls */
  workspaceId?: string;
  /** Period start date for immersive dialog */
  periodStart?: string;
  /** Period end date for immersive dialog */
  periodEnd?: string;
  /** IANA timezone identifier for period calculations (e.g., 'America/New_York'). Defaults to 'UTC'. */
  timezone?: string;
  /** Enable clicking to open immersive category breakdown dialog (default: true) */
  enableImmersiveView?: boolean;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

// Minimum percentage threshold for a segment to be visible in the pie chart
const MIN_SEGMENT_PERCENTAGE = 1.5; // Segments below 1.5% get grouped into "Other"

export function CategoryDonutChart({
  transactions,
  currency = 'USD',
  className,
  type,
  workspaceId,
  periodStart,
  periodEnd,
  timezone = 'UTC',
  enableImmersiveView = true,
}: CategoryDonutChartProps) {
  const t = useTranslations('finance-transactions');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [isConfidential, setIsConfidential] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Extract date string from period timestamps (handles both YYYY-MM-DD and full ISO timestamps)
  // IMPORTANT: Do NOT convert to UTC - extract the date directly from the local ISO string
  const extractDateString = (timestamp: string): string => {
    // If it's already just a date (YYYY-MM-DD), return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
      return timestamp;
    }
    // ISO timestamps start with YYYY-MM-DDTHH:MM:SS
    // Extract the date part directly WITHOUT converting to UTC
    // This preserves the local date when timezone offset is included
    const dateMatch = timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch?.[1]) {
      return dateMatch[1];
    }
    // Fallback: use original timestamp
    return timestamp;
  };

  const periodStartDate = periodStart
    ? extractDateString(periodStart)
    : undefined;
  const periodEndDate = periodEnd ? extractDateString(periodEnd) : undefined;

  // Check if immersive view is available (needs workspace context)
  const canOpenDialog =
    enableImmersiveView && !!workspaceId && !!periodStartDate;

  // Sync with confidential mode cookie
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

  // Fetch category data from RPC when workspace context is available
  const shouldFetchCategories = !!workspaceId && !!periodStartDate;

  const { data: rpcCategoryData, isLoading: isCategoriesLoading } = useQuery({
    queryKey: [
      'category-donut',
      workspaceId,
      periodStartDate,
      periodEndDate,
      type || 'all',
      timezone,
    ],
    queryFn: async () => {
      const supabase = createClient();
      // Create start/end timestamps in the user's timezone
      // IMPORTANT: Use the resolved timezone, not UTC, to ensure we query the correct local day
      const startDate = dayjs
        .tz(`${periodStartDate} 00:00:00`, timezone)
        .toISOString();
      const endDate = dayjs
        .tz(`${periodEndDate || periodStartDate} 23:59:59.999`, timezone)
        .toISOString();

      const { data, error } = await supabase.rpc('get_category_breakdown', {
        _ws_id: workspaceId!, // Safe: query is only enabled when workspaceId exists
        _start_date: startDate,
        _end_date: endDate,
        include_confidential: true,
        _transaction_type: type,
        _interval: 'daily',
        _anchor_to_latest: false,
        _timezone: timezone, // Pass timezone for correct date grouping
      });

      if (error) throw error;
      return data as {
        period: string;
        category_id: string | null;
        category_name: string;
        category_icon: string | null;
        category_color: string | null;
        total: number;
      }[];
    },
    staleTime: 2 * 60 * 1000, // 2 minute cache
    refetchOnWindowFocus: false,
    enabled: shouldFetchCategories,
  });

  // Process RPC data into chart format
  const rpcProcessedData = useMemo(() => {
    if (!rpcCategoryData || rpcCategoryData.length === 0) return null;

    // Aggregate by category (RPC may return multiple periods)
    const categoryMap = new Map<
      string,
      { value: number; color: string | null }
    >();

    rpcCategoryData.forEach((item) => {
      const categoryName = item.category_name || t('no-category');
      const existing = categoryMap.get(categoryName);

      if (existing) {
        categoryMap.set(categoryName, {
          value: existing.value + Number(item.total),
          color: existing.color ?? item.category_color,
        });
      } else {
        categoryMap.set(categoryName, {
          value: Number(item.total),
          color: item.category_color,
        });
      }
    });

    // Calculate total for percentages
    const total = Array.from(categoryMap.values()).reduce(
      (sum, item) => sum + item.value,
      0
    );

    if (total === 0) return [];

    // Convert to array and sort by value
    const sorted = Array.from(categoryMap.entries())
      .map(([name, data], index) => ({
        name,
        value: data.value,
        color: data.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
        percentage: (data.value / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    // Apply same smart grouping logic
    const significantCategories: CategoryData[] = [];
    const tinyCategories: CategoryData[] = [];

    sorted.forEach((item) => {
      if (item.percentage >= MIN_SEGMENT_PERCENTAGE) {
        significantCategories.push(item);
      } else {
        tinyCategories.push(item);
      }
    });

    // Assign colors to significant categories
    const result: CategoryData[] = significantCategories.map((item, index) => ({
      ...item,
      color: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
    }));

    // Group tiny categories into "Other"
    if (tinyCategories.length > 0) {
      const otherTotal = tinyCategories.reduce(
        (sum, item) => sum + item.value,
        0
      );
      const otherPercentage = (otherTotal / total) * 100;
      result.push({
        name: t('other-categories'),
        value: otherTotal,
        // Use hex colors for "Other" since CSS variables may not work in SVG fill
        color: resolvedTheme === 'dark' ? '#a1a1aa' : '#d4d4d8', // zinc-400 / zinc-300
        percentage: otherPercentage,
      });
    }

    return result;
  }, [rpcCategoryData, t, resolvedTheme]);

  // Aggregate transactions by category (fallback when RPC not available)
  const clientCategoryData = useMemo(() => {
    const categoryMap = new Map<
      string,
      { value: number; color: string | null }
    >();

    transactions.forEach((tx) => {
      // Skip confidential amounts
      if (tx.amount === null && tx.is_amount_confidential) return;
      if (!tx.amount) return;

      // Filter by type if specified
      if (type === 'income' && tx.amount < 0) return;
      if (type === 'expense' && tx.amount > 0) return;

      const categoryName =
        tx.is_category_confidential && !tx.category
          ? t('no-category')
          : tx.category || t('no-category');

      const amount = Math.abs(tx.amount);
      const existing = categoryMap.get(categoryName);

      if (existing) {
        categoryMap.set(categoryName, {
          value: existing.value + amount,
          color: existing.color ?? tx.category_color ?? null,
        });
      } else {
        categoryMap.set(categoryName, {
          value: amount,
          color: tx.category_color ?? null,
        });
      }
    });

    // Calculate total for percentages
    const total = Array.from(categoryMap.values()).reduce(
      (sum, item) => sum + item.value,
      0
    );

    if (total === 0) return [];

    // Convert to array and sort by value
    const sorted = Array.from(categoryMap.entries())
      .map(([name, data], index) => ({
        name,
        value: data.value,
        color: data.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
        percentage: (data.value / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    // Smart grouping: Only group segments that are too small to display
    // Keep all segments that have >= MIN_SEGMENT_PERCENTAGE
    const significantCategories: CategoryData[] = [];
    const tinyCategories: CategoryData[] = [];

    sorted.forEach((item) => {
      if (item.percentage >= MIN_SEGMENT_PERCENTAGE) {
        significantCategories.push(item);
      } else {
        tinyCategories.push(item);
      }
    });

    // Assign colors to significant categories
    const result: CategoryData[] = significantCategories.map((item, index) => ({
      ...item,
      color: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
    }));

    // Only add "Other" if there are tiny categories AND their combined total is significant
    if (tinyCategories.length > 0) {
      const otherValue = tinyCategories.reduce(
        (sum, item) => sum + item.value,
        0
      );
      const otherPercentage = (otherValue / total) * 100;

      // Only show "Other" if it represents at least 0.5% of total
      if (otherPercentage >= 0.5) {
        result.push({
          name: t('other-categories'),
          value: otherValue,
          // Use a proper gray color that works in charts
          color: resolvedTheme === 'dark' ? '#6b7280' : '#9ca3af', // gray-500 / gray-400
          percentage: otherPercentage,
        });
      }
    }

    return result;
  }, [transactions, type, t, resolvedTheme]);

  // Use RPC data if available, otherwise fall back to client data
  const categoryData = useMemo(() => {
    if (shouldFetchCategories && rpcProcessedData) {
      return rpcProcessedData;
    }
    return clientCategoryData;
  }, [shouldFetchCategories, rpcProcessedData, clientCategoryData]);

  // Show loading state when fetching categories
  const isCategoryFetching = shouldFetchCategories && isCategoriesLoading;

  const total = useMemo(
    () => categoryData.reduce((sum, item) => sum + item.value, 0),
    [categoryData]
  );

  const formatValue = (value: number) => {
    if (isConfidential) return '•••••';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Show loading skeleton when fetching category data
  if (isCategoryFetching) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="mx-auto h-36 w-36 rounded-full" />
        <div className="flex flex-wrap justify-center gap-1 px-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        <Skeleton className="mx-auto h-6 w-20" />
      </div>
    );
  }

  if (categoryData.length === 0) {
    return (
      <div
        className={cn(
          'flex h-32 items-center justify-center text-muted-foreground text-xs',
          className
        )}
      >
        {t('not-enough-data')}
      </div>
    );
  }

  const chartConfig = categoryData.reduce((acc, item) => {
    acc[item.name] = {
      label: item.name,
      color: item.color,
    };
    return acc;
  }, {} as ChartConfig);

  // Calculate how many legend items to show based on available space
  // Show more items on the legend, max 8 to avoid overcrowding
  const maxLegendItems = Math.min(categoryData.length, 8);
  const legendItems = categoryData.slice(0, maxLegendItems);
  const remainingCount = categoryData.length - maxLegendItems;

  return (
    <>
      <div
        className={cn(
          'space-y-2',
          canOpenDialog && 'cursor-pointer transition-opacity hover:opacity-80',
          className
        )}
        onClick={canOpenDialog ? () => setDialogOpen(true) : undefined}
        role={canOpenDialog ? 'button' : undefined}
        tabIndex={canOpenDialog ? 0 : undefined}
        onKeyDown={
          canOpenDialog
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDialogOpen(true);
                }
              }
            : undefined
        }
      >
        <ChartContainer config={chartConfig} className="mx-auto h-36 w-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                paddingAngle={1}
                dataKey="value"
                stroke="none"
              >
                {categoryData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => [
                      <span
                        key={String(name)}
                        className="font-medium text-foreground"
                      >
                        {formatValue(Number(value))} (
                        {categoryData
                          .find((c) => c.name === name)
                          ?.percentage.toFixed(0)}
                        %)
                      </span>,
                      name,
                    ]}
                  />
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        {/* Legend - show as many as reasonably fit */}
        <div className="space-y-1">
          {legendItems.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <div
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-muted-foreground">
                  {item.name}
                </span>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {isConfidential ? '•••' : `${item.percentage.toFixed(0)}%`}
              </span>
            </div>
          ))}
          {remainingCount > 0 && (
            <div className="text-center text-[10px] text-muted-foreground">
              +{remainingCount} more
            </div>
          )}
        </div>

        {/* Total */}
        <div className="border-t pt-2 text-center">
          <div className="font-semibold text-sm tabular-nums">
            {formatValue(total)}
          </div>
          <div className="text-muted-foreground text-xs">
            {canOpenDialog ? t('tap-for-details') : t('category-distribution')}
          </div>
        </div>
      </div>

      {/* Immersive Category Breakdown Dialog */}
      {canOpenDialog && (
        <CategoryBreakdownDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          workspaceId={workspaceId}
          periodStart={periodStartDate}
          periodEnd={periodEndDate}
          currency={currency}
          timezone={timezone}
          initialCategoryData={categoryData}
          initialType={type}
        />
      )}
    </>
  );
}
