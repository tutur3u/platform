'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Transaction } from '@tuturuuu/types/primitives/Transaction';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Calendar, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TransactionCard } from './transaction-card';
import { TransactionEditDialog } from './transaction-edit-dialog';

interface InfiniteTransactionsListProps {
  wsId: string;
  walletId?: string;
  initialData?: Transaction[];
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
}

export function InfiniteTransactionsList({
  wsId,
  walletId,
  // initialData = [],
}: InfiniteTransactionsListProps) {
  const t = useTranslations();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
    // Invalidate all transaction-related queries (including infinite scroll)
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes(`/api/workspaces/${wsId}/transactions`),
    });
  };

  const q = searchParams.get('q') || '';
  const userIds = searchParams.getAll('userIds');
  const categoryIds = searchParams.getAll('categoryIds');
  const walletIds = searchParams.getAll('walletIds');

  const buildQueryString = (cursor?: string) => {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (q) params.set('q', q);
    if (walletId) params.set('walletId', walletId);
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
    ],
    queryFn: async ({ pageParam }) => {
      const queryString = buildQueryString(pageParam as string | undefined);
      const response = await fetch(
        `/api/workspaces/${wsId}/transactions/infinite?${queryString}`
      );
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
  });

  // Get all transactions before any conditional returns
  const allTransactions = data?.pages.flatMap((page) => page.data) || [];

  // Group transactions by date - must be called before any early returns
  const groupedTransactions = useMemo(() => {
    const groups: GroupedTransactions[] = [];
    const now = moment();

    allTransactions.forEach((transaction) => {
      const transactionDate = moment(transaction.taken_at);
      const dateKey = transactionDate.format('YYYY-MM-DD');

      // Determine the label based on the date
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
        label = transactionDate.format('YYYY');
      }

      // Find or create group
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4 text-center">
        <p className="text-dynamic-red text-sm">
          {t('common.error')}:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (allTransactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">{t('common.no-results')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupedTransactions.map((group) => {
        // Calculate daily total
        const dailyTotal = group.transactions.reduce(
          (sum, transaction) => sum + (transaction.amount || 0),
          0
        );
        const isPositive = dailyTotal >= 0;

        return (
          <div
            key={group.date}
            className="space-y-4 rounded-xl border border-dynamic-gray/20 bg-dynamic-gray/10 p-2 md:p-4"
          >
            {/* Date header */}
            <div className="sticky top-0 z-10 border-border/40 border-b pt-1 pb-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-base text-foreground">
                      {group.label}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="font-normal text-xs"
                      >
                        {group.transactions.length}{' '}
                        {group.transactions.length === 1
                          ? t('date_groups.transaction')
                          : t('date_groups.transactions')}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Daily total */}
                <div className="flex items-center gap-2">
                  {isPositive ? (
                    <TrendingUp className="h-4 w-4 text-dynamic-green" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-dynamic-red" />
                  )}
                  <div
                    className={`font-bold text-base tabular-nums ${
                      isPositive ? 'text-dynamic-green' : 'text-dynamic-red'
                    }`}
                  >
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

            {/* Transactions for this date */}
            <div className="grid gap-3">
              {group.transactions.map((transaction) => (
                <button
                  type="button"
                  key={transaction.id}
                  onClick={() => handleTransactionClick(transaction)}
                  className="cursor-pointer"
                >
                  <TransactionCard transaction={transaction} wsId={wsId} />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Auto-load trigger */}
      <div ref={loadMoreRef} className="py-4">
        {isFetchingNextPage && (
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasNextPage && !isFetchingNextPage && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              className="w-full md:w-auto"
            >
              {t('user-data-table.common.load_more')}
            </Button>
          </div>
        )}

        {!hasNextPage && allTransactions.length > 10 && (
          <p className="text-center text-muted-foreground text-sm">
            {t('user-data-table.common.end_of_list')}
          </p>
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
        />
      )}
    </div>
  );
}
