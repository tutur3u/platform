'use client';

import {
  useInfiniteQuery,
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TransactionCard } from './transaction-card';
import { TransactionEditDialog } from './transaction-edit-dialog';
import { TransactionStatistics } from './transaction-statistics';

interface InfiniteTransactionsListProps {
  wsId: string;
  walletId?: string;
  initialData?: Transaction[];
  canUpdateTransactions?: boolean;
  canDeleteTransactions?: boolean;
  canUpdateConfidentialTransactions?: boolean;
  canDeleteConfidentialTransactions?: boolean;
  canViewConfidentialAmount?: boolean;
  canViewConfidentialDescription?: boolean;
  canViewConfidentialCategory?: boolean;
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
}

export function InfiniteTransactionsList({
  wsId,
  walletId,
  canUpdateTransactions,
  canDeleteTransactions,
  canUpdateConfidentialTransactions,
  canDeleteConfidentialTransactions,
  canViewConfidentialAmount,
  canViewConfidentialDescription,
  canViewConfidentialCategory,
}: InfiniteTransactionsListProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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

  const buildQueryString = (cursor?: string) => {
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
    params.set('limit', '20');
    return params.toString();
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery<TransactionResponse>({
    queryKey: [
      `/api/workspaces/${wsId}/transactions/infinite`,
      q,
      userIds,
      categoryIds,
      walletIds,
      walletId,
      start,
      end,
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
  });

  const allTransactions = data?.pages.flatMap((page) => page.data) || [];

  // Check if any filter is active
  const hasActiveFilter =
    !!q ||
    userIds.length > 0 ||
    categoryIds.length > 0 ||
    walletIds.length > 0 ||
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

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: GroupedTransactions[] = [];
    const now = moment();

    allTransactions.forEach((transaction) => {
      const transactionDate = moment(transaction.taken_at);
      const dateKey = transactionDate.format('YYYY-MM-DD');

      let label: string;
      const daysDiff = now.diff(transactionDate, 'days');

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
  }, [allTransactions, t]);

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

  if (allTransactions.length === 0) {
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
      {/* Statistics Summary - Only show when filters are active */}
      {hasActiveFilter && (stats || isStatsLoading) && (
        <TransactionStatistics
          transactions={allTransactions}
          stats={stats}
          isLoading={isStatsLoading}
        />
      )}

      {groupedTransactions.map((group, groupIndex) => {
        const dailyTotal = group.transactions.reduce((sum, transaction) => {
          if (
            transaction.amount === null &&
            transaction.is_amount_confidential
          ) {
            return sum;
          }
          return sum + (transaction.amount || 0);
        }, 0);

        const isPositive = dailyTotal >= 0;
        const hasRedactedAmounts = group.transactions.some(
          (transaction) =>
            transaction.amount === null && transaction.is_amount_confidential
        );
        const allAmountsRedacted = group.transactions.every(
          (transaction) =>
            transaction.amount === null && transaction.is_amount_confidential
        );

        const isExpanded = expandedGroups.has(group.date);
        const displayCount = isExpanded ? group.transactions.length : 3;

        // Calculate stats for the group
        const amounts = group.transactions
          .filter(
            (transaction) =>
              !(
                transaction.amount === null &&
                transaction.is_amount_confidential
              )
          )
          .map((transaction) => transaction.amount || 0);
        const income = amounts.filter((a) => a > 0).reduce((a, b) => a + b, 0);
        const expense = amounts.filter((a) => a < 0).reduce((a, b) => a + b, 0);

        return (
          <div
            key={group.date}
            className={cn(
              'group/group rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300',
              'hover:shadow-md'
            )}
            style={{
              animationDelay: `${groupIndex * 50}ms`,
              animation: 'fadeInUp 0.4s ease-out forwards',
            }}
          >
            {/* Date header */}
            <div className="border-border/40 border-b bg-muted/30 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Left: Date info */}
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm ring-1 ring-primary/20">
                    <Calendar className="h-6 w-6 text-primary" />
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
                        {group.transactions.length}{' '}
                        {group.transactions.length === 1
                          ? t('date_groups.transaction')
                          : t('date_groups.transactions')}
                      </Badge>
                      {!allAmountsRedacted && income > 0 && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-dynamic-green" />
                          <span className="text-dynamic-green">
                            {Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency: 'VND',
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
                              currency: 'VND',
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
                    <div className="flex flex-col items-end gap-1">
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
                            currency: 'VND',
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
            <div className="space-y-3 p-4">
              {group.transactions.slice(0, displayCount).map((transaction) => (
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
                    onEdit={() => handleTransactionClick(transaction)}
                    canEdit={canUpdateTransactions}
                    canDelete={canDeleteTransactions}
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

        {!hasNextPage && allTransactions.length > 10 && (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center">
            <p className="text-muted-foreground text-sm">
              🎉 {t('user-data-table.common.end_of_list')}
            </p>
          </div>
        )}
      </div>

      {/* Transaction Edit Dialog */}
      {selectedTransaction && (
        <TransactionEditDialog
          transaction={selectedTransaction}
          wsId={wsId}
          isOpen={isEditDialogOpen}
          onClose={handleCloseDialog}
          onUpdate={handleTransactionUpdate}
          canUpdateTransactions={canUpdateTransactions}
          canDeleteTransactions={canDeleteTransactions}
          canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
          canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
          canViewConfidentialAmount={canViewConfidentialAmount}
          canViewConfidentialDescription={canViewConfidentialDescription}
          canViewConfidentialCategory={canViewConfidentialCategory}
        />
      )}

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
