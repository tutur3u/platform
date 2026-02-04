'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type { TransactionViewMode } from '@tuturuuu/types/primitives/TransactionPeriod';
import { cn, getCurrencyLocale } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Initialize dayjs plugins for timezone-aware date operations
dayjs.extend(utc);
dayjs.extend(timezonePlugin);

import { Button } from '../../../button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../collapsible';
import { Skeleton } from '../../../skeleton';
import { ActivityDistributionChart } from './activity-distribution-chart';
import { CategoryDonutChart } from './category-donut-chart';

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

interface PeriodBreakdownPanelProps {
  transactions: Transaction[];
  viewMode: TransactionViewMode;
  periodStart: string;
  periodEnd?: string;
  currency?: string;
  /** IANA timezone identifier for period calculations (e.g., 'America/New_York'). Defaults to 'UTC'. */
  timezone?: string;
  periodStats?: {
    totalIncome: number;
    totalExpense: number;
    netTotal: number;
    transactionCount: number;
    hasRedactedAmounts?: boolean;
  };
  previousPeriodStats?: {
    netTotal: number;
  };
  isLoading?: boolean;
  className?: string;
  /** Workspace ID for immersive category breakdown dialog */
  workspaceId?: string;
}

export function PeriodBreakdownPanel({
  transactions,
  viewMode,
  periodStart,
  periodEnd,
  currency = 'USD',
  timezone = 'UTC',
  periodStats,
  previousPeriodStats,
  isLoading = false,
  className,
  workspaceId,
}: PeriodBreakdownPanelProps) {
  const t = useTranslations('finance-transactions');
  const [isConfidential, setIsConfidential] = useState(true);

  // Default expanded state: collapsed for daily, expanded for weekly+
  const defaultExpanded = viewMode !== 'daily';
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Update expanded state when viewMode changes
  useEffect(() => {
    setIsExpanded(viewMode !== 'daily');
  }, [viewMode]);

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

  // Extract date string from period timestamps (handles both YYYY-MM-DD and full ISO timestamps)
  // IMPORTANT: Do NOT convert to UTC - extract the date directly from the local ISO string
  const extractDateString = useCallback((timestamp: string): string => {
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
  }, []);

  const periodStartDate = useMemo(
    () => extractDateString(periodStart),
    [periodStart, extractDateString]
  );

  // Calculate period end date based on viewMode if not provided
  const computedPeriodEnd = useMemo(() => {
    if (periodEnd) return extractDateString(periodEnd);

    const start = new Date(periodStartDate);
    switch (viewMode) {
      case 'daily':
        return periodStartDate; // Same day
      case 'weekly': {
        const end = new Date(start);
        end.setDate(end.getDate() + 6); // 7 days
        return end.toISOString().split('T')[0];
      }
      case 'monthly': {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // Last day of month
        return end.toISOString().split('T')[0];
      }
      case 'yearly': {
        const end = new Date(start.getFullYear(), 11, 31); // Dec 31st
        return end.toISOString().split('T')[0];
      }
      default:
        return periodStartDate;
    }
  }, [periodStartDate, periodEnd, viewMode, extractDateString]);

  // For daily view without pre-computed stats, fetch from RPC
  const shouldFetchStats =
    viewMode === 'daily' && !periodStats && !!workspaceId;

  const { data: rpcStats, isLoading: isStatsLoading } = useQuery({
    queryKey: [
      'period-stats',
      workspaceId,
      periodStartDate,
      computedPeriodEnd,
      viewMode,
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
        .tz(`${computedPeriodEnd} 23:59:59.999`, timezone)
        .toISOString();

      const { data, error } = await supabase.rpc('get_transaction_stats', {
        p_ws_id: workspaceId!, // Safe: query is only enabled when workspaceId exists
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (error) throw error;

      // RPC returns an array with one row
      const row = data?.[0];
      if (!row) {
        return {
          totalIncome: 0,
          totalExpense: 0,
          netTotal: 0,
          transactionCount: 0,
          hasRedactedAmounts: false,
        };
      }

      return {
        totalIncome: Number(row.total_income) || 0,
        totalExpense: Number(row.total_expense) || 0,
        netTotal: Number(row.net_total) || 0,
        transactionCount: Number(row.total_transactions) || 0,
        hasRedactedAmounts: row.has_redacted_amounts || false,
      };
    },
    staleTime: 2 * 60 * 1000, // 2 minute cache
    refetchOnWindowFocus: false,
    enabled: shouldFetchStats,
  });

  // Calculate stats from transactions as fallback if RPC not available
  const clientStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let hasRedactedAmounts = false;

    transactions.forEach((tx) => {
      if (tx.amount === null && tx.is_amount_confidential) {
        hasRedactedAmounts = true;
        return;
      }
      if (!tx.amount) return;

      if (tx.amount > 0) {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
      }
    });

    return {
      totalIncome,
      totalExpense,
      netTotal: totalIncome + totalExpense,
      transactionCount: transactions.length,
      hasRedactedAmounts,
    };
  }, [transactions]);

  // Use pre-computed periodStats, RPC stats, or client-calculated stats
  const stats = useMemo(() => {
    // Priority: periodStats (from parent) > rpcStats (from RPC) > clientStats (calculated)
    if (periodStats) return periodStats;
    if (shouldFetchStats && rpcStats) return rpcStats;
    return clientStats;
  }, [periodStats, shouldFetchStats, rpcStats, clientStats]);

  // Show loading state when fetching RPC stats
  const isStatsFetching = shouldFetchStats && isStatsLoading;

  // Calculate trend vs previous period
  const trendVsPrevious = useMemo(() => {
    if (!previousPeriodStats || previousPeriodStats.netTotal === 0) return null;
    const change =
      ((stats.netTotal - previousPeriodStats.netTotal) /
        Math.abs(previousPeriodStats.netTotal)) *
      100;
    return {
      value: change,
      isPositive: change > 0,
    };
  }, [stats.netTotal, previousPeriodStats]);

  const formatCompactValue = (value: number) => {
    if (isConfidential) return '•••';
    return new Intl.NumberFormat(getCurrencyLocale(currency), {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  };

  // Not enough transactions to visualize (skip this check when using RPC stats)
  const hasRpcData = shouldFetchStats && (rpcStats || isStatsLoading);
  if (transactions.length < 2 && !isLoading && !hasRpcData) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center',
          className
        )}
      >
        <BarChart3 className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">{t('not-enough-data')}</p>
      </div>
    );
  }

  if (isLoading || isStatsFetching) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn('space-y-3', className)}>
        {/* Header with toggle */}
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="flex h-auto w-full items-center justify-between p-2 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground text-sm">
                {t('period-insights')}
              </span>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        {/* Summary Cards - Always visible */}
        <div className="grid grid-cols-3 gap-2">
          {/* Income */}
          <div className="rounded-lg bg-dynamic-green/10 p-2 text-center">
            <TrendingUp className="mx-auto mb-1 h-3 w-3 text-dynamic-green" />
            <div className="font-semibold text-dynamic-green text-xs tabular-nums">
              {formatCompactValue(stats.totalIncome)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t('income')}
            </div>
          </div>

          {/* Expense */}
          <div className="rounded-lg bg-dynamic-red/10 p-2 text-center">
            <TrendingDown className="mx-auto mb-1 h-3 w-3 text-dynamic-red" />
            <div className="font-semibold text-dynamic-red text-xs tabular-nums">
              {formatCompactValue(Math.abs(stats.totalExpense))}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t('expense')}
            </div>
          </div>

          {/* Net */}
          <div
            className={cn(
              'rounded-lg p-2 text-center',
              stats.netTotal >= 0 ? 'bg-dynamic-green/10' : 'bg-dynamic-red/10'
            )}
          >
            {stats.netTotal >= 0 ? (
              <TrendingUp
                className={cn(
                  'mx-auto mb-1 h-3 w-3',
                  stats.netTotal >= 0
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
                )}
              />
            ) : (
              <TrendingDown
                className={cn(
                  'mx-auto mb-1 h-3 w-3',
                  stats.netTotal >= 0
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
                )}
              />
            )}
            <div
              className={cn(
                'font-semibold text-xs tabular-nums',
                stats.netTotal >= 0 ? 'text-dynamic-green' : 'text-dynamic-red'
              )}
            >
              {stats.hasRedactedAmounts && '≈ '}
              {formatCompactValue(stats.netTotal)}
            </div>
            <div className="text-[10px] text-muted-foreground">{t('net')}</div>
          </div>
        </div>

        {/* Category Distribution - Always visible for daily view */}
        {viewMode === 'daily' && (
          <div className="rounded-xl border bg-card/50 p-3">
            <CategoryDonutChart
              transactions={transactions}
              currency={currency}
              workspaceId={workspaceId}
              periodStart={periodStartDate}
              periodEnd={computedPeriodEnd}
              timezone={timezone}
            />
          </div>
        )}

        {/* Collapsible Content - Contains additional charts for non-daily views */}
        <CollapsibleContent className="space-y-3">
          {/* Trend Badge */}
          {trendVsPrevious && (
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="text-muted-foreground text-xs">
                {t('vs-previous')}:
              </span>
              <span
                className={cn(
                  'flex items-center gap-1 font-semibold text-xs',
                  trendVsPrevious.isPositive
                    ? 'text-dynamic-green'
                    : 'text-dynamic-red'
                )}
              >
                {trendVsPrevious.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {isConfidential
                  ? '•••%'
                  : `${trendVsPrevious.isPositive ? '+' : ''}${trendVsPrevious.value.toFixed(0)}%`}
              </span>
            </div>
          )}

          {/* Category Distribution - Only in collapsible for non-daily views */}
          {viewMode !== 'daily' && (
            <div className="rounded-xl border bg-card/50 p-3">
              <CategoryDonutChart
                transactions={transactions}
                currency={currency}
                workspaceId={workspaceId}
                periodStart={periodStartDate}
                periodEnd={computedPeriodEnd}
                timezone={timezone}
              />
            </div>
          )}

          {/* Activity Distribution - Only for non-daily views */}
          {viewMode !== 'daily' && (
            <div className="rounded-xl border bg-card/50 p-3">
              <ActivityDistributionChart
                transactions={transactions}
                viewMode={viewMode}
                periodStart={periodStartDate}
                currency={currency}
              />
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
