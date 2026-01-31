'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { walletColumns } from '@tuturuuu/ui/finance/wallets/columns';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useState } from 'react';

interface WalletsDataTableProps {
  wsId: string;
  data: Wallet[];
  count: number;
  filters?: ReactNode[];
  canUpdateWallets?: boolean;
  canDeleteWallets?: boolean;
  currency?: string;
  isPersonalWorkspace?: boolean;
  page?: string;
  pageSize?: string;
}

export function WalletsDataTable({
  wsId,
  data,
  count,
  filters,
  canUpdateWallets,
  canDeleteWallets,
  currency = 'USD',
  isPersonalWorkspace,
  page,
  pageSize,
}: WalletsDataTableProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      const newSearchParams = new URLSearchParams(searchParams?.toString());

      if (params.page !== undefined) {
        newSearchParams.set('page', params.page.toString());
      }

      if (params.pageSize !== undefined) {
        newSearchParams.set('pageSize', params.pageSize);
      }

      router.push(`${pathname}?${newSearchParams.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const pageIndex = page ? Number.parseInt(page, 10) - 1 : 0;
  const pageSizeValue = pageSize ? Number.parseInt(pageSize, 10) : 10;

  return (
    <div className="relative">
      <DataTable
        t={t}
        data={data}
        columnGenerator={walletColumns}
        extraData={{
          canUpdateWallets,
          canDeleteWallets,
          currency,
          isPersonalWorkspace,
        }}
        filters={filters}
        namespace="wallet-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          description: false,
          type: false,
          currency: false,
          report_opt_in: false,
          created_at: false,
        }}
        onRowClick={canUpdateWallets ? handleRowClick : undefined}
        pageIndex={pageIndex}
        pageSize={pageSizeValue}
        setParams={handleSetParams}
      />

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
