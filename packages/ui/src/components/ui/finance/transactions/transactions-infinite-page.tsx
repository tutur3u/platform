'use client';

import { Download, Upload } from '@tuturuuu/icons';
import type { TransactionViewMode } from '@tuturuuu/types/primitives/TransactionPeriod';
import { Button } from '@tuturuuu/ui/button';
import SearchBar from '@tuturuuu/ui/custom/search-bar';
import { Dialog, DialogContent, DialogTrigger } from '@tuturuuu/ui/dialog';
import { DateRangeFilterWrapper } from '@tuturuuu/ui/finance/shared/date-range-filter-wrapper';
import { CategoryFilterWrapper } from '@tuturuuu/ui/finance/transactions/category-filter-wrapper';
import { InfiniteTransactionsList } from '@tuturuuu/ui/finance/transactions/infinite-transactions-list';
import MoneyLoverImportDialog from '@tuturuuu/ui/finance/transactions/money-lover-import-dialog';
import { TagFilterWrapper } from '@tuturuuu/ui/finance/transactions/tag-filter-wrapper';
import { UserFilterWrapper } from '@tuturuuu/ui/finance/transactions/user-filter-wrapper';
import { ViewModeToggle } from '@tuturuuu/ui/finance/transactions/view-mode-toggle';
import { WalletFilterWrapper } from '@tuturuuu/ui/finance/transactions/wallet-filter-wrapper';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { Suspense } from 'react';

const VIEW_MODES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

interface TransactionsInfinitePageProps {
  wsId: string;
  currency?: string;
  /** IANA timezone identifier for period grouping (e.g., 'America/New_York'). Defaults to 'UTC'. */
  timezone?: string | null;
  canExport?: boolean;
  exportContent?: React.ReactNode;
  canCreateTransactions?: boolean;
  canCreateConfidentialTransactions?: boolean;
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
  timezone,
  canExport,
  exportContent,
  canCreateTransactions,
  canCreateConfidentialTransactions,
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

  const [viewMode, setViewMode] = useQueryState(
    'viewMode',
    parseAsStringLiteral(VIEW_MODES).withDefault('daily').withOptions({
      shallow: true,
    })
  );

  const handleSearch = async (query: string) => {
    await setQ(query || '');
  };

  const handleViewModeChange = async (mode: TransactionViewMode) => {
    await setViewMode(mode);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col items-start justify-between gap-3 lg:flex-row">
        <div className="grid w-full grid-cols-1 xs:grid-cols-2 gap-2 md:flex md:flex-1 md:flex-wrap md:items-center md:gap-2">
          <SearchBar
            t={t}
            defaultValue={q || ''}
            onSearch={handleSearch}
            className="col-span-full w-full bg-background md:max-w-xs"
          />
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <DateRangeFilterWrapper />
          </Suspense>
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <UserFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <CategoryFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <WalletFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <TagFilterWrapper wsId={wsId} />
          </Suspense>
          <Suspense
            fallback={<Skeleton className="h-9 w-full md:h-8 md:w-32" />}
          >
            <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          </Suspense>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          {/* Import button */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full sm:h-8 md:w-fit"
              >
                <Download className="h-4 w-4" />
                {t('common.import')}
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
              <MoneyLoverImportDialog wsId={wsId} currency={currency} />
            </DialogContent>
          </Dialog>

          {/* Export button */}
          {canExport && exportContent && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full sm:h-8 md:w-fit"
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
          timezone={timezone}
          viewMode={viewMode}
          canCreateTransactions={canCreateTransactions}
          canCreateConfidentialTransactions={canCreateConfidentialTransactions}
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
