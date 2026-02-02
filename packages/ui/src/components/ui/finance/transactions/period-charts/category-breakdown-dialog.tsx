'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, RotateCcw } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { Button } from '../../../button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../chart';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../dialog';
import { ScrollArea } from '../../../scroll-area';
import { Skeleton } from '../../../skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../../tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../tooltip';

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
const CATEGORY_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
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

interface CategoryBreakdownData {
  period: string;
  category_id: string | null;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  total: number;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
  percentage: number;
  icon?: string | null;
}

interface CategoryBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  walletId?: string;
  periodStart: string;
  periodEnd?: string;
  currency?: string;
  /** Pre-computed data as fallback from parent - used while RPC loads */
  initialCategoryData?: CategoryData[];
  /** Initial type to display */
  initialType?: 'expense' | 'income';
}

export function CategoryBreakdownDialog({
  open,
  onOpenChange,
  workspaceId,
  periodStart,
  periodEnd,
  currency = 'USD',
  initialCategoryData,
  initialType = 'expense',
}: CategoryBreakdownDialogProps) {
  const t = useTranslations('finance-transactions');
  const locale = useLocale();
  const [isConfidential, setIsConfidential] = useState(true);
  const [type, setType] = useState<'expense' | 'income'>(initialType);
  // Track hidden categories by name
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set()
  );

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

  // Reset type and hidden categories when dialog opens
  useEffect(() => {
    if (open) {
      setType(initialType);
      setHiddenCategories(new Set());
    }
  }, [open, initialType]);

  // Reset hidden categories when type changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when type changes
  useEffect(() => {
    setHiddenCategories(new Set());
  }, [type]);

  // Toggle category visibility
  const toggleCategory = (categoryName: string) => {
    setHiddenCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  // Reset all hidden categories
  const resetHiddenCategories = () => {
    setHiddenCategories(new Set());
  };

  // Fetch category breakdown via RPC
  const { data: rpcData, isLoading } = useQuery({
    queryKey: [
      'category-breakdown-dialog',
      workspaceId,
      periodStart,
      periodEnd,
      type,
    ],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_category_breakdown', {
        _ws_id: workspaceId,
        _start_date: periodStart,
        _end_date: periodEnd,
        include_confidential: true,
        _transaction_type: type,
        _interval: 'daily', // Single period aggregation
        _anchor_to_latest: false,
      });

      if (error) throw error;
      return data as CategoryBreakdownData[];
    },
    staleTime: 5 * 60 * 1000, // 5 minute cache
    refetchOnWindowFocus: false,
    enabled: open && !!workspaceId,
  });

  // Process RPC data into chart-ready format (all categories)
  const allCategoryData = useMemo(() => {
    if (!rpcData || rpcData.length === 0) {
      // Use initial data as fallback while loading
      return initialCategoryData || [];
    }

    // Aggregate by category (RPC may return multiple periods)
    const categoryMap = new Map<
      string,
      { value: number; color: string | null; icon: string | null }
    >();

    rpcData.forEach((item) => {
      const categoryName = item.category_name || t('no-category');
      const existing = categoryMap.get(categoryName);

      if (existing) {
        categoryMap.set(categoryName, {
          value: existing.value + Number(item.total),
          color: existing.color ?? item.category_color,
          icon: existing.icon ?? item.category_icon,
        });
      } else {
        categoryMap.set(categoryName, {
          value: Number(item.total),
          color: item.category_color,
          icon: item.category_icon,
        });
      }
    });

    // Calculate total for percentages
    const total = Array.from(categoryMap.values()).reduce(
      (sum, item) => sum + item.value,
      0
    );

    if (total === 0) return [];

    // Convert to array and sort by value (descending)
    const sorted = Array.from(categoryMap.entries())
      .map(([name, data], index) => ({
        name,
        value: data.value,
        color: data.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length]!,
        percentage: (data.value / total) * 100,
        icon: data.icon,
      }))
      .sort((a, b) => b.value - a.value);

    return sorted;
  }, [rpcData, initialCategoryData, t]);

  // Filter out hidden categories for chart display
  const visibleCategoryData = useMemo(() => {
    const filtered = allCategoryData.filter(
      (item) => !hiddenCategories.has(item.name)
    );

    // Recalculate percentages based on visible categories only
    const visibleTotal = filtered.reduce((sum, item) => sum + item.value, 0);
    if (visibleTotal === 0) return [];

    return filtered.map((item) => ({
      ...item,
      percentage: (item.value / visibleTotal) * 100,
    }));
  }, [allCategoryData, hiddenCategories]);

  // Calculate totals
  const totalAll = useMemo(
    () => allCategoryData.reduce((sum, item) => sum + item.value, 0),
    [allCategoryData]
  );

  const totalVisible = useMemo(
    () => visibleCategoryData.reduce((sum, item) => sum + item.value, 0),
    [visibleCategoryData]
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

  const formatPercentage = (percentage: number) => {
    if (isConfidential) return '•••%';
    return `${percentage.toFixed(1)}%`;
  };

  const formatDateRange = () => {
    const start = new Date(periodStart);
    const end = periodEnd ? new Date(periodEnd) : start;

    const dateFormatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const startFormatted = dateFormatter.format(start);
    const endFormatted = dateFormatter.format(end);

    // Same day
    if (startFormatted === endFormatted) {
      return startFormatted;
    }

    return `${startFormatted} – ${endFormatted}`;
  };

  const chartConfig = visibleCategoryData.reduce((acc, item) => {
    acc[item.name] = {
      label: item.name,
      color: item.color,
    };
    return acc;
  }, {} as ChartConfig);

  const hasHiddenCategories = hiddenCategories.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 inset-0! top-0! left-0! flex h-screen max-h-screen w-screen max-w-none! translate-x-0! translate-y-0! flex-col gap-0 overflow-hidden rounded-none! border-0 p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <DialogTitle className="font-semibold text-xl">
                {t('category-breakdown')}
              </DialogTitle>
              <p className="text-muted-foreground text-sm">
                {formatDateRange()}
              </p>
            </div>
            <Tabs
              value={type}
              onValueChange={(v) => setType(v as 'expense' | 'income')}
              className="shrink-0"
            >
              <TabsList className="grid w-full grid-cols-2 sm:w-[220px]">
                <TabsTrigger
                  value="expense"
                  className="text-sm data-[state=active]:bg-dynamic-red/10 data-[state=active]:text-dynamic-red"
                >
                  {t('expense')}
                </TabsTrigger>
                <TabsTrigger
                  value="income"
                  className="text-sm data-[state=active]:bg-dynamic-green/10 data-[state=active]:text-dynamic-green"
                >
                  {t('income')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left: Pie Chart */}
          <div className="flex shrink-0 flex-col items-center justify-center border-b p-6 lg:w-2/5 lg:border-r lg:border-b-0 lg:p-8">
            {isLoading && !initialCategoryData ? (
              <div className="flex flex-col items-center gap-6">
                <Skeleton className="h-48 w-48 rounded-full sm:h-64 sm:w-64" />
                <div className="space-y-2 text-center">
                  <Skeleton className="mx-auto h-8 w-40" />
                  <Skeleton className="mx-auto h-4 w-24" />
                </div>
              </div>
            ) : visibleCategoryData.length === 0 ? (
              <div className="flex h-48 w-48 flex-col items-center justify-center rounded-full border-2 border-dashed text-center text-muted-foreground sm:h-64 sm:w-64">
                <EyeOff className="mb-2 h-8 w-8" />
                <span className="px-4 text-sm">
                  {hasHiddenCategories ? t('all-hidden') : t('not-enough-data')}
                </span>
                {hasHiddenCategories && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetHiddenCategories}
                    className="mt-2"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {t('show-all')}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <ChartContainer
                  config={chartConfig}
                  className="h-48 w-48 sm:h-64 sm:w-64 lg:h-80 lg:w-80 xl:h-96 xl:w-96"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={visibleCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius="35%"
                        outerRadius="85%"
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                        animationDuration={300}
                      >
                        {visibleCategoryData.map((entry) => (
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
                                {visibleCategoryData
                                  .find((c) => c.name === name)
                                  ?.percentage.toFixed(1)}
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

                {/* Total below chart */}
                <div className="mt-6 text-center">
                  <div
                    className={cn(
                      'font-bold text-3xl tabular-nums sm:text-4xl',
                      type === 'expense'
                        ? 'text-dynamic-red'
                        : 'text-dynamic-green'
                    )}
                  >
                    {formatValue(totalVisible)}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {type === 'expense'
                      ? t('total-expenses')
                      : t('total-income')}
                    {hasHiddenCategories && (
                      <span className="ml-1 text-xs">({t('filtered')})</span>
                    )}
                  </div>
                  {hasHiddenCategories && (
                    <div className="mt-2 text-muted-foreground text-xs">
                      {t('hidden-total')}:{' '}
                      {formatValue(totalAll - totalVisible)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Ranked List */}
          <div className="flex min-h-0 flex-1 flex-col lg:w-3/5">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-muted/30 px-6 py-4">
              <h3 className="font-semibold">
                {t('all-categories')}
                {allCategoryData.length > 0 && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({visibleCategoryData.length}/{allCategoryData.length})
                  </span>
                )}
              </h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetHiddenCategories}
                      disabled={!hasHiddenCategories}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('show-all')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('reset-filter')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {isLoading && !initialCategoryData ? (
              <div className="space-y-4 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <Skeleton className="h-5 flex-1" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : allCategoryData.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
                {t('not-enough-data')}
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-4 pb-8 sm:p-6 sm:pb-10">
                  {allCategoryData.map((item, index) => {
                    const isHidden = hiddenCategories.has(item.name);
                    const visibleItem = visibleCategoryData.find(
                      (v) => v.name === item.name
                    );

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => toggleCategory(item.name)}
                        className={cn(
                          'group w-full cursor-pointer rounded-xl p-4 text-left transition-all',
                          isHidden
                            ? 'opacity-50 hover:opacity-75'
                            : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Top row: rank, name, amount */}
                        <div className="flex items-center gap-4">
                          {/* Visibility toggle indicator */}
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors',
                              isHidden
                                ? 'bg-muted text-muted-foreground'
                                : index === 0
                                  ? 'bg-dynamic-yellow/20 text-dynamic-yellow'
                                  : index === 1
                                    ? 'bg-muted text-muted-foreground'
                                    : index === 2
                                      ? 'bg-dynamic-orange/20 text-dynamic-orange'
                                      : 'bg-muted/50 text-muted-foreground'
                            )}
                          >
                            {isHidden ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <span className="font-semibold">{index + 1}</span>
                            )}
                          </div>

                          {/* Color dot + Name */}
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div
                              className={cn(
                                'h-4 w-4 shrink-0 rounded-full ring-2 ring-background transition-opacity',
                                isHidden && 'opacity-40'
                              )}
                              style={{ backgroundColor: item.color }}
                            />
                            <span
                              className={cn(
                                'truncate font-medium transition-colors',
                                isHidden && 'text-muted-foreground line-through'
                              )}
                            >
                              {item.name}
                            </span>
                          </div>

                          {/* Amount and percentage */}
                          <div className="shrink-0 text-right">
                            <div
                              className={cn(
                                'font-semibold tabular-nums transition-colors',
                                isHidden && 'text-muted-foreground'
                              )}
                            >
                              {formatValue(item.value)}
                            </div>
                            <div className="text-muted-foreground text-sm tabular-nums">
                              {isHidden
                                ? formatPercentage(item.percentage)
                                : formatPercentage(
                                    visibleItem?.percentage ?? item.percentage
                                  )}
                            </div>
                          </div>

                          {/* Toggle indicator on hover */}
                          <div
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
                              isHidden
                                ? 'bg-dynamic-green/10 text-dynamic-green'
                                : 'bg-muted/50 text-muted-foreground opacity-0 group-hover:opacity-100'
                            )}
                          >
                            {isHidden ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              isHidden && 'opacity-40'
                            )}
                            style={{
                              width: `${isHidden ? item.percentage : (visibleItem?.percentage ?? item.percentage)}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
