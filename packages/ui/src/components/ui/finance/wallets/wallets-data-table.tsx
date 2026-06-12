'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from '@tuturuuu/icons';
import { listInfiniteWallets } from '@tuturuuu/internal-api/finance';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { walletColumns } from '@tuturuuu/ui/finance/wallets/columns';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { useExchangeRates } from '@tuturuuu/ui/hooks/use-exchange-rates';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFinanceBalanceMode } from '../shared/use-finance-balance-mode';

const WALLET_PAGE_SIZE = 20;

interface WalletsDataTableProps {
  wsId: string;
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  currency?: string;
  financePrefix?: string;
  isPersonalWorkspace?: boolean;
  query?: string;
}

export function WalletsDataTable({
  wsId,
  canUpdateWallets,
  canDeleteWallets,
  currency = 'USD',
  financePrefix = '/finance',
  isPersonalWorkspace,
  query,
}: WalletsDataTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: exchangeRatesResponse } = useExchangeRates();
  const { mode: balanceMode } = useFinanceBalanceMode();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query?.trim() ?? '';
  const walletsQuery = useInfiniteQuery({
    queryKey: ['wallets', wsId, 'infinite', normalizedQuery, WALLET_PAGE_SIZE],
    queryFn: ({ pageParam }) =>
      listInfiniteWallets(wsId, {
        limit: WALLET_PAGE_SIZE,
        offset: pageParam,
        q: normalizedQuery,
      }),
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
  });
  const wallets = useMemo(
    () =>
      (walletsQuery.data?.pages.flatMap((page) => page.data) ?? []).map(
        (wallet) => ({
          ...wallet,
          href: `/${wsId}${financePrefix}/wallets/${wallet.id}`,
          ws_id: wsId,
        })
      ),
    [financePrefix, walletsQuery.data?.pages, wsId]
  );
  const totalCount = walletsQuery.data?.pages.at(0)?.totalCount ?? 0;

  // State for edit dialog
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleRowClick = useCallback(
    (row: Wallet) => {
      if (!canUpdateWallets) return;
      setSelectedWallet(row);
      setShowEditDialog(true);
    },
    [canUpdateWallets]
  );

  const handleEditComplete = useCallback(() => {
    setShowEditDialog(false);
    queryClient.invalidateQueries({
      queryKey: ['wallets', wsId],
    });
  }, [queryClient, wsId]);

  const updateSearchQuery = useCallback(
    (nextQuery: string) => {
      const newSearchParams = new URLSearchParams(searchParams?.toString());
      const trimmedQuery = nextQuery.trim();

      if (trimmedQuery) {
        newSearchParams.set('q', trimmedQuery);
      } else {
        newSearchParams.delete('q');
      }
      newSearchParams.delete('page');
      newSearchParams.delete('pageSize');

      const queryString = newSearchParams.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const resetSearchQuery = useCallback(() => {
    updateSearchQuery('');
  }, [updateSearchQuery]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !walletsQuery.hasNextPage ||
      walletsQuery.isFetchingNextPage
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void walletsQuery.fetchNextPage();
        }
      },
      { rootMargin: '160px' }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [
    walletsQuery.fetchNextPage,
    walletsQuery.hasNextPage,
    walletsQuery.isFetchingNextPage,
  ]);

  return (
    <div className="relative">
      <DataTable
        t={t}
        data={walletsQuery.isLoading ? undefined : wallets}
        columnGenerator={walletColumns}
        extraData={{
          balanceMode,
          canUpdateWallets,
          canDeleteWallets,
          currency,
          exchangeRates: exchangeRatesResponse?.data,
          isPersonalWorkspace,
        }}
        namespace="wallet-data-table"
        defaultQuery={normalizedQuery}
        defaultVisibility={{
          id: false,
          description: false,
          type: false,
          currency: false,
          report_opt_in: false,
          created_at: false,
        }}
        hidePagination
        isFiltered={normalizedQuery.length > 0}
        onRefresh={() => void walletsQuery.refetch()}
        onRowClick={canUpdateWallets ? handleRowClick : undefined}
        onSearch={updateSearchQuery}
        resetParams={resetSearchQuery}
      />

      {!walletsQuery.isLoading && walletsQuery.isError && (
        <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-4 text-dynamic-red text-sm">
          {walletsQuery.error instanceof Error
            ? walletsQuery.error.message
            : t('wallet-data-table.load_error')}
        </div>
      )}

      {!walletsQuery.isLoading && !walletsQuery.isError && (
        <div
          ref={loadMoreRef}
          className="mt-4 flex flex-col items-center gap-3"
        >
          <div className="text-muted-foreground text-sm">
            {t('wallet-data-table.loaded_count', {
              loaded: wallets.length,
              total: totalCount,
            })}
          </div>
          {walletsQuery.isFetchingNextPage && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('wallet-data-table.loading_more')}
            </div>
          )}
          {walletsQuery.hasNextPage && !walletsQuery.isFetchingNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void walletsQuery.fetchNextPage()}
            >
              <ChevronDown className="mr-2 h-4 w-4" />
              {t('wallet-data-table.load_more')}
            </Button>
          )}
          {!walletsQuery.hasNextPage && wallets.length > WALLET_PAGE_SIZE && (
            <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-2 text-muted-foreground text-sm">
              {t('wallet-data-table.end_of_list')}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      {selectedWallet && (
        <ModifiableDialogTrigger
          data={selectedWallet}
          open={showEditDialog}
          title={t('ws-wallets.edit')}
          editDescription={t('ws-wallets.edit_description')}
          setOpen={setShowEditDialog}
          form={
            <WalletForm
              wsId={wsId}
              data={selectedWallet}
              onFinish={handleEditComplete}
              isPersonalWorkspace={isPersonalWorkspace}
            />
          }
          requireExpansion={!isPersonalWorkspace}
        />
      )}
    </div>
  );
}
