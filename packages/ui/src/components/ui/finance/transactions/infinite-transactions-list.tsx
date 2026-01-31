'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingDown,
  TrendingUp,
} from '@tuturuuu/icons';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import type {
  TransactionPeriod,
  TransactionPeriodResponse,
  TransactionViewMode,
} from '@tuturuuu/types/primitives/TransactionPeriod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import 'moment/locale/vi';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransactionForm } from './form';
import { TransactionCard } from './transaction-card';
import { TransactionStatistics } from './transaction-statistics';

interface InfiniteTransactionsListProps {
  wsId: string;
  walletId?: string;
  initialData?: Transaction[];
  currency?: string;
  /** View mode for transaction grouping */
  viewMode?: TransactionViewMode;
  canUpdateTransactions?: boolean;
  canDeleteTransactions?: boolean;
  canUpdateConfidentialTransactions?: boolean;
  canDeleteConfidentialTransactions?: boolean;
  canViewConfidentialAmount?: boolean;
  canViewConfidentialDescription?: boolean;
  canViewConfidentialCategory?: boolean;
  /** Hide transaction creator (useful for personal workspaces) */
  isPersonalWorkspace?: boolean;
}

interface TransactionResponse {
  data: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface GroupedTransactions {
  date: string;
  label: string;
  transactions: Transaction[];
  isExpanded?: boolean;
  /** Pre-computed period statistics from server (for period-based views) */
  periodStats?: {
    totalIncome: number;
    totalExpense: number;
    netTotal: number;
    transactionCount: number;
    hasRedactedAmounts?: boolean;
  };
}

export function InfiniteTransactionsList({
  wsId,
  walletId,
  currency,
  viewMode = 'daily',
  canUpdateTransactions,
  canDeleteTransactions,
  canUpdateConfidentialTransactions,
  canDeleteConfidentialTransactions: _canDeleteConfidentialTransactions,
  canViewConfidentialAmount: _canViewConfidentialAmount,
  canViewConfidentialDescription: _canViewConfidentialDescription,
  canViewConfidentialCategory: _canViewConfidentialCategory,
  isPersonalWorkspace,
}: InfiniteTransactionsListProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] =
    useState<Transaction | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Set moment locale
  useEffect(() => {
    moment.locale(locale);
  }, [locale]);

  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedTransaction(null);
  };

  const handleTransactionUpdate = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes(`/api/workspaces/${wsId}/transactions`),
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/${transactionId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to delete transaction');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('ws-transactions.transaction_deleted'));
      handleTransactionUpdate();
      setTransactionToDelete(null);
    },
    onError: (error: Error) => {
      toast.error(
        error.message || t('ws-transactions.failed_to_delete_transaction')
      );
    },
  });

  const handleDeleteClick = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
  };

  const handleConfirmDelete = () => {
    if (transactionToDelete?.id) {
      deleteMutation.mutate(transactionToDelete.id);
    }
  };

  const toggleGroup = (dateKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  const [q] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
    })
  );

  const [userIds] = useQueryState(
    'userIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [categoryIds] = useQueryState(
    'categoryIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [walletIds] = useQueryState(
    'walletIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [tagIds] = useQueryState(
    'tagIds',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
      shallow: true,
    })
  );

  const [start] = useQueryState(
    'start',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const [end] = useQueryState(
    'end',
    parseAsString.withOptions({
      shallow: true,
    })
  );

  const buildQueryString = (cursor?: string, isPeriods = false) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (q) params.set('q', q);
    if (walletId) params.set('walletId', walletId);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    userIds.forEach((id) => {
      params.append('userIds', id);
    });
    categoryIds.forEach((id) => {
      params.append('categoryIds', id);
    });
    walletIds.forEach((id) => {
      params.append('walletIds', id);
    });
    tagIds.forEach((id) => {
      params.append('tagIds', id);
    });
    if (isPeriods) {
      params.set('viewMode', viewMode);
      params.set('limit', '10');
    } else {
      params.set('limit', '20');
    }
    return params.toString();
  };

  // Generate period label based on view mode
  const generatePeriodLabel = useCallback(
    (periodStart: string, mode: TransactionViewMode): string => {
      const date = moment(periodStart);
      const now = moment();

      switch (mode) {
        case 'daily': {
          const daysDiff = now.startOf('day').diff(date.startOf('day'), 'days');
          if (daysDiff === 0) return t('date_groups.today');
          if (daysDiff === 1) return t('date_groups.yesterday');
          return date.format('dddd, DD MMMM YYYY');
        }
        case 'weekly': {
          const weekNum = date.isoWeek();
          const year = date.isoWeekYear();
          const weekStart = date.clone().startOf('isoWeek');
          const weekEnd = date.clone().endOf('isoWeek');
          const rangeStr = `${weekStart.format('MMM D')} - ${weekEnd.format('MMM D, YYYY')}`;
          return `${t('finance-transactions.week-label', { number: weekNum, year })} (${rangeStr})`;
        }
        case 'monthly':
          return date.format('MMMM YYYY');
        case 'yearly':
          return date.format('YYYY');
        default:
          return date.format('dddd, DD MMMM YYYY');
      }
    },
    [t]
  );

  // Use periods endpoint for non-daily view modes
  const usePeriods = viewMode !== 'daily';

  // Query for daily view (individual transactions)
  const {
    data: dailyData,
    fetchNextPage: fetchNextDailyPage,
    hasNextPage: hasNextDailyPage,
    isFetchingNextPage: isFetchingNextDailyPage,
    isLoading: isLoadingDaily,
    error: dailyError,
  } = useInfiniteQuery<TransactionResponse>({
    queryKey: [
      `/api/workspaces/${wsId}/transactions/infinite`,
      q,
      userIds,
      categoryIds,
      walletIds,
      tagIds,
      walletId,
      start,
      end,
      'daily',
    ],
    queryFn: async ({ pageParam }) => {
      const queryString = buildQueryString(pageParam as string | undefined);
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/infinite?${queryString}`
      );
      if (!response.ok) throw new Error('Failed to fetch transactions');

      const json = (await response.json()) as TransactionResponse;

      return {
        ...json,
        data: json.data.map((tx) => ({
          ...tx,
          is_amount_confidential: tx.is_amount_confidential ?? undefined,
          is_category_confidential: tx.is_category_confidential ?? undefined,
          is_description_confidential:
            tx.is_description_confidential ?? undefined,
        })),
      } satisfies TransactionResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
    enabled: !usePeriods,
  });

  // Query for period-based views (weekly, monthly, yearly)
  const {
    data: periodsData,
    fetchNextPage: fetchNextPeriodsPage,
    hasNextPage: hasNextPeriodsPage,
    isFetchingNextPage: isFetchingNextPeriodsPage,
    isLoading: isLoadingPeriods,
    error: periodsError,
  } = useInfiniteQuery<TransactionPeriodResponse>({
    queryKey: [
      `/api/workspaces/${wsId}/transactions/periods`,
      q,
      userIds,
      categoryIds,
      walletIds,
      tagIds,
      walletId,
      start,
      end,
      viewMode,
    ],
    queryFn: async ({ pageParam }) => {
      const queryString = buildQueryString(
        pageParam as string | undefined,
        true
      );
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/periods?${queryString}`
      );
      if (!response.ok) throw new Error('Failed to fetch transaction periods');

      return (await response.json()) as TransactionPeriodResponse;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
    enabled: usePeriods,
  });

  // Unified state based on view mode
  const fetchNextPage = usePeriods ? fetchNextPeriodsPage : fetchNextDailyPage;
  const hasNextPage = usePeriods ? hasNextPeriodsPage : hasNextDailyPage;
  const isFetchingNextPage = usePeriods
    ? isFetchingNextPeriodsPage
    : isFetchingNextDailyPage;
  const isLoading = usePeriods ? isLoadingPeriods : isLoadingDaily;
  const error = usePeriods ? periodsError : dailyError;

  // All transactions for daily view
  const allTransactions = usePeriods
    ? []
    : dailyData?.pages.flatMap((page) => page.data) || [];

  // All periods for period-based views
  const allPeriods: TransactionPeriod[] = usePeriods
    ? periodsData?.pages.flatMap((page) => page.data) || []
    : [];

  // Check if any filter is active
  const hasActiveFilter =
    !!q ||
    userIds.length > 0 ||
    categoryIds.length > 0 ||
    walletIds.length > 0 ||
    tagIds.length > 0 ||
    !!start ||
    !!end ||
    !!walletId;

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: [
      `/api/workspaces/${wsId}/transactions/stats`,
      q,
      userIds,
      categoryIds,
      walletIds,
      tagIds,
      walletId,
      start,
      end,
    ],
    queryFn: async () => {
      const queryString = buildQueryString();
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/stats?${queryString}`
      );
      if (!response.ok) throw new Error('Failed to fetch transaction stats');
      return response.json();
    },
    enabled: hasActiveFilter && !isLoading && !error,
  });

  // Group transactions by date (for daily view) or use periods (for other views)
  const groupedTransactions = useMemo(() => {
    // For period-based views, convert periods to grouped transactions format
    if (usePeriods) {
      return allPeriods.map((period) => ({
        date: period.periodStart,
        label: generatePeriodLabel(period.periodStart, viewMode),
        transactions: period.transactions || [],
        // Store period stats for display
        periodStats: {
          totalIncome: period.totalIncome,
          totalExpense: period.totalExpense,
          netTotal: period.netTotal,
          transactionCount: period.transactionCount,
          hasRedactedAmounts: period.hasRedactedAmounts,
        },
      }));
    }

    // For daily view, group transactions by date
    const groups: GroupedTransactions[] = [];
    const now = moment();

    allTransactions.forEach((transaction) => {
      const transactionDate = moment(transaction.taken_at);
      const dateKey = transactionDate.format('YYYY-MM-DD');

      let label: string;
      const daysDiff = now
        .startOf('day')
        .diff(transactionDate.clone().startOf('day'), 'days');

      if (daysDiff === 0) {
        label = t('date_groups.today');
      } else if (daysDiff === 1) {
        label = t('date_groups.yesterday');
      } else if (daysDiff < 7) {
        label = transactionDate.format('dddd, DD MMMM YYYY');
      } else if (transactionDate.isSame(now, 'month')) {
        label = transactionDate.format('dddd, DD MMMM YYYY');
      } else if (transactionDate.isSame(now, 'year')) {
        label = transactionDate.format('MMMM YYYY');
      } else {
        label = transactionDate.format('dddd, DD MMMM YYYY');
      }

      let group = groups.find((g) => g.date === dateKey);
      if (!group) {
        group = { date: dateKey, label, transactions: [] };
        groups.push(group);
      }

      group.transactions.push(transaction);
    });

    return groups;
  }, [
    allTransactions,
    allPeriods,
    usePeriods,
    viewMode,
    t,
    generatePeriodLabel,
  ]);

  // Intersection Observer for auto-loading
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
        </div>
        <p className="animate-pulse text-muted-foreground text-sm">
          {t('common.loading')}...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dynamic-red/30 bg-linear-to-br from-dynamic-red/10 to-dynamic-red/5 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-dynamic-red/20">
          <TrendingDown className="h-8 w-8 text-dynamic-red" />
        </div>
        <h3 className="mb-2 font-semibold text-dynamic-red text-lg">
          {t('common.error')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  // Check if there's no data (either no transactions for daily or no periods for other views)
  const hasNoData = usePeriods
    ? allPeriods.length === 0
    : allTransactions.length === 0;

  if (hasNoData) {
    return (
      <div className="rounded-2xl border border-muted-foreground/20 border-dashed bg-muted/20 p-12 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <Calendar className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="mb-2 font-semibold text-foreground text-lg">
          {t('common.no-results')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('workspace-finance-transactions.no-transactions-found')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Summary - Only show when filters are active (daily view only uses transactions for stats) */}
      {hasActiveFilter && (stats || isStatsLoading) && !usePeriods && (
        <TransactionStatistics
          transactions={allTransactions}
          stats={stats}
          isLoading={isStatsLoading}
          currency={currency}
        />
      )}

      {groupedTransactions.map((group, groupIndex) => {
        // Use pre-computed period stats if available (for period-based views)
        const hasPeriodStats = !!group.periodStats;

        // Calculate stats from transactions if not pre-computed
        const dailyTotal = hasPeriodStats
          ? group.periodStats!.netTotal
          : group.transactions.reduce(
              (sum: number, transaction: Transaction) => {
                if (
                  transaction.amount === null &&
                  transaction.is_amount_confidential
                ) {
                  return sum;
                }
                return sum + (transaction.amount || 0);
              },
              0
            );

        const isPositive = dailyTotal >= 0;

        const hasRedactedAmounts = hasPeriodStats
          ? group.periodStats!.hasRedactedAmounts
          : group.transactions.some(
              (transaction: Transaction) =>
                transaction.amount === null &&
                transaction.is_amount_confidential
            );

        const allAmountsRedacted = hasPeriodStats
          ? group.periodStats!.transactionCount > 0 &&
            group.periodStats!.totalIncome === 0 &&
            group.periodStats!.totalExpense === 0 &&
            group.periodStats!.hasRedactedAmounts
          : group.transactions.every(
              (transaction: Transaction) =>
                transaction.amount === null &&
                transaction.is_amount_confidential
            );

        const isExpanded = expandedGroups.has(group.date);
        const displayCount = isExpanded ? group.transactions.length : 3;

        // Calculate stats for the group
        const transactionCount = hasPeriodStats
          ? group.periodStats!.transactionCount
          : group.transactions.length;

        let income: number;
        let expense: number;

        if (hasPeriodStats) {
          income = group.periodStats!.totalIncome;
          expense = group.periodStats!.totalExpense;
        } else {
          const amounts = group.transactions
            .filter(
              (transaction: Transaction) =>
                !(
                  transaction.amount === null &&
                  transaction.is_amount_confidential
                )
            )
            .map((transaction: Transaction) => transaction.amount || 0);
          income = amounts
            .filter((a: number) => a > 0)
            .reduce((a: number, b: number) => a + b, 0);
          expense = amounts
            .filter((a: number) => a < 0)
            .reduce((a: number, b: number) => a + b, 0);
        }

        return (
          <div
            key={group.date}
            className={cn(
              'group/group rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300',
              'hover:shadow-md'
            )}
            style={{
              animationName: 'fadeInUp',
              animationDuration: '0.4s',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'forwards',
              animationDelay: `${groupIndex * 50}ms`,
            }}
          >
            {/* Date header */}
            <div className="border-border/40 border-b bg-muted/30 px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                {/* Left: Date info */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm ring-1 ring-primary/20 sm:flex sm:h-12 sm:w-12">
                    <Calendar className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-foreground text-lg">
                      {group.label}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                      <Badge
                        variant="secondary"
                        className="font-medium text-xs"
                      >
                        {transactionCount}{' '}
                        {transactionCount === 1
                          ? t('date_groups.transaction')
                          : t('date_groups.transactions')}
                      </Badge>
                      {!allAmountsRedacted && income > 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-dynamic-green" />
                          <span className="text-dynamic-green">
                            {Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency: currency || 'USD',
                              notation: 'compact',
                              maximumFractionDigits: 1,
                            }).format(income)}
                          </span>
                        </div>
                      )}
                      {!allAmountsRedacted && expense < 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3 text-dynamic-red" />
                          <span className="text-dynamic-red">
                            {Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency: currency || 'USD',
                              notation: 'compact',
                              maximumFractionDigits: 1,
                            }).format(Math.abs(expense))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Daily total */}
                {!allAmountsRedacted ? (
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-start gap-1 sm:items-end">
                      <span className="text-muted-foreground text-xs">
                        {t('workspace-finance-transactions.net-total')}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full',
                            isPositive
                              ? 'bg-dynamic-green/10'
                              : 'bg-dynamic-red/10'
                          )}
                        >
                          {isPositive ? (
                            <TrendingUp className="h-4 w-4 text-dynamic-green" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-dynamic-red" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'font-bold text-xl tabular-nums',
                            isPositive
                              ? 'text-dynamic-green'
                              : 'text-dynamic-red'
                          )}
                        >
                          {hasRedactedAmounts && '≈ '}
                          {Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: currency || 'USD',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                            signDisplay: 'always',
                          }).format(dailyTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-sm italic">
                      {t('workspace-finance-transactions.amount-redacted')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Transactions list */}
            <div className="space-y-2 p-3 sm:space-y-3 sm:p-4">
              {group.transactions
                .slice(0, displayCount)
                .map((transaction: Transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => handleTransactionClick(transaction)}
                    className="cursor-pointer"
                  >
                    <TransactionCard
                      transaction={{
                        ...transaction,
                        is_amount_confidential:
                          transaction.is_amount_confidential ?? undefined,
                        is_category_confidential:
                          transaction.is_category_confidential ?? undefined,
                        is_description_confidential:
                          transaction.is_description_confidential ?? undefined,
                      }}
                      wsId={wsId}
                      currency={currency}
                      onEdit={() => handleTransactionClick(transaction)}
                      onDelete={() => handleDeleteClick(transaction)}
                      canEdit={canUpdateTransactions}
                      canDelete={canDeleteTransactions}
                      showCreator={!isPersonalWorkspace}
                      isDaily={viewMode === 'daily'}
                    />
                  </div>
                ))}

              {/* Show more/less button */}
              {group.transactions.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full border border-dashed transition-all hover:border-solid hover:bg-muted"
                  onClick={() => toggleGroup(group.date)}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      {t('common.show-less')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      {t('common.show-more')} (
                      {group.transactions.length - displayCount}{' '}
                      {t('date_groups.more')})
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Auto-load trigger */}
      <div ref={loadMoreRef} className="py-6">
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm">
              {t('common.loading')}...
            </span>
          </div>
        )}

        {hasNextPage && !isFetchingNextPage && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="lg"
              onClick={() => fetchNextPage()}
              className="w-full transition-all hover:scale-105 md:w-auto"
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              {t('user-data-table.common.load_more')}
            </Button>
          </div>
        )}

        {!hasNextPage &&
          (usePeriods
            ? allPeriods.length > 5
            : allTransactions.length > 10) && (
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <p className="text-muted-foreground text-sm">
                {t('user-data-table.common.end_of_list')}
              </p>
            </div>
          )}
      </div>

      {/* Transaction Edit Dialog */}
      {selectedTransaction && (
        <ModifiableDialogTrigger
          data={selectedTransaction}
          open={isEditDialogOpen}
          title={t('ws-transactions.edit')}
          editDescription={t('ws-transactions.edit_description')}
          setOpen={(open) => {
            if (!open) {
              handleCloseDialog();
            }
          }}
          form={
            <TransactionForm
              wsId={wsId}
              data={selectedTransaction}
              canUpdateTransactions={canUpdateTransactions}
              canUpdateConfidentialTransactions={
                canUpdateConfidentialTransactions
              }
              onFinish={() => {
                handleTransactionUpdate();
                handleCloseDialog();
              }}
            />
          }
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!transactionToDelete}
        onOpenChange={(open) => !open && setTransactionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ws-transactions.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-transactions.confirm_delete_transaction')}
              {transactionToDelete?.description && (
                <span className="mt-2 block font-medium text-foreground">
                  "{transactionToDelete.description}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.deleting')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
