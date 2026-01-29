'use client';

import { Download, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { Dialog, DialogContent, DialogTrigger } from '@tuturuuu/ui/dialog';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { CategoryFilterWrapper } from '@tuturuuu/ui/finance/transactions/category-filter-wrapper';
import { InfiniteTransactionsList } from '@tuturuuu/ui/finance/transactions/infinite-transactions-list';
import MoneyLoverImportDialog from '@tuturuuu/ui/finance/transactions/money-lover-import-dialog';
import { TagFilterWrapper } from '@tuturuuu/ui/finance/transactions/tag-filter-wrapper';
import { UserFilterWrapper } from '@tuturuuu/ui/finance/transactions/user-filter-wrapper';
import { WalletFilterWrapper } from '@tuturuuu/ui/finance/transactions/wallet-filter-wrapper';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { Suspense } from 'react';

interface TransactionsInfinitePageProps {
  wsId: string;
  currency?: string;
  canExport?: boolean;
  exportContent?: React.ReactNode;
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

export function TransactionsInfinitePage({
  wsId,
  currency,
  canExport,
  exportContent,
  canUpdateTransactions,
  canDeleteTransactions,
  canUpdateConfidentialTransactions,
  canDeleteConfidentialTransactions,
  canViewConfidentialAmount,
  canViewConfidentialDescription,
  canViewConfidentialCategory,
  isPersonalWorkspace,
}: TransactionsInfinitePageProps) {
  const t = useTranslations();
  const [q, setQ] = useQueryState(
    'q',
    parseAsString.withDefault('').withOptions({
      shallow: true,
      throttleMs: 300,
    })
  );

  const handleSearch = async (query: string) => {
    await setQ(query || '');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-2 md:flex-row">
        <div className="grid w-full flex-1 flex-wrap items-center gap-2 md:flex">
          <SearchBar
            t={t}
            defaultValue={q || ''}
            onSearch={handleSearch}
            className="col-span-full w-full bg-background md:col-span-1 md:max-w-xs"
          />
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <DateRangeFilterWrapper />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <UserFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <CategoryFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <WalletFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <TagFilterWrapper wsId={wsId} />
          </Suspense>
        </div>

        <div className="flex w-full gap-2 md:w-auto">
          {/* Import button */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full md:w-fit"
              >
                <Download className="h-4 w-4" />
                {t('common.import')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <MoneyLoverImportDialog wsId={wsId} />
            </DialogContent>
          </Dialog>

          {/* Export button */}
          {canExport && exportContent && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full md:w-fit"
                >
                  <Upload className="h-4 w-4" />
                  {t('common.export')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                {exportContent}
              </DialogContent>
            </Dialog>
          )}

          {/* Create button */}
        </div>
      </div>

      {/* Transaction list */}
      <Suspense
        fallback={
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        }
      >
        <InfiniteTransactionsList
          wsId={wsId}
          currency={currency}
          canUpdateTransactions={canUpdateTransactions}
          canDeleteTransactions={canDeleteTransactions}
          canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
          canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
          canViewConfidentialAmount={canViewConfidentialAmount}
          canViewConfidentialDescription={canViewConfidentialDescription}
          canViewConfidentialCategory={canViewConfidentialCategory}
          isPersonalWorkspace={isPersonalWorkspace}
        />
      </Suspense>
    </div>
  );
}
