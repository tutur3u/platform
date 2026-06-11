import {
  type InternalApiClientOptions,
  listWallets,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { CreateDialogFeatureSummary } from '@tuturuuu/ui/finance/shared/create-dialog-feature-summary';
import { WalletCheckpointHistoryDialog } from '@tuturuuu/ui/finance/wallets/checkpoints/wallet-checkpoint-history-dialog';
import { WalletTotalCheckDialog } from '@tuturuuu/ui/finance/wallets/checkpoints/wallet-total-check-dialog';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { WalletsDataTable } from '@tuturuuu/ui/finance/wallets/wallets-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    create?: string;
    q: string;
    page: string;
    pageSize: string;
  };
  page?: string;
  pageSize?: string;
  currency?: string;
  financePrefix?: string;
  internalApiOptions?: InternalApiClientOptions;
  openCreateDialog?: boolean;
  permissions?: PermissionsResult;
  workspace?: {
    personal?: boolean | null;
  };
}

export default async function WalletsPage({
  wsId,
  searchParams,
  page,
  pageSize,
  currency,
  financePrefix = '/finance',
  internalApiOptions,
  openCreateDialog = false,
  permissions,
  workspace,
}: Props) {
  const [t, resolvedPermissions, resolvedCurrency, resolvedWorkspace] =
    await Promise.all([
      getTranslations(),
      permissions ? Promise.resolve(permissions) : getPermissions({ wsId }),
      currency
        ? Promise.resolve(currency)
        : getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
      workspace ? Promise.resolve(workspace) : getWorkspace(wsId),
    ]);
  if (!resolvedPermissions || !resolvedWorkspace) notFound();
  const { containsPermission } = resolvedPermissions;

  const canCreateWallets = containsPermission('create_wallets');
  const canUpdateWallets = containsPermission('update_wallets');
  const canDeleteWallets = containsPermission('delete_wallets');
  const canCreateTransactions = containsPermission('create_transactions');
  const resolvedInternalApiOptions =
    internalApiOptions ?? withForwardedInternalApiAuth(await headers());
  const {
    data: rawData,
    count,
    allWallets,
  } = await getData(wsId, searchParams, resolvedInternalApiOptions);

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}${financePrefix}/wallets/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <CreateDialogFeatureSummary
        pluralTitle={t('ws-wallets.plural')}
        singularTitle={t('ws-wallets.singular')}
        description={t('ws-wallets.description')}
        createTitle={t('ws-wallets.create')}
        createDescription={t('ws-wallets.create_description')}
        defaultOpen={openCreateDialog || searchParams.create === 'wallet'}
        form={canCreateWallets ? <WalletForm wsId={wsId} /> : undefined}
      />
      <Separator className="my-4" />
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <WalletCheckpointHistoryDialog
          wsId={wsId}
          financePrefix={financePrefix}
          canCreateTransactions={canCreateTransactions}
        />
        <WalletTotalCheckDialog
          wsId={wsId}
          wallets={allWallets
            .filter((wallet) => !!wallet.id)
            .map((wallet) => ({
              audit_balance: wallet.audit_balance,
              audit_status: wallet.audit_status,
              audit_variance: wallet.audit_variance,
              balance: wallet.balance,
              currency: wallet.currency || resolvedCurrency || 'USD',
              id: wallet.id as string,
              name: wallet.name,
            }))}
          canUpdateWallets={canUpdateWallets}
        />
      </div>
      <WalletsDataTable
        wsId={wsId}
        data={data}
        count={count}
        canUpdateWallets={canUpdateWallets}
        canDeleteWallets={canDeleteWallets}
        currency={resolvedCurrency ?? 'USD'}
        isPersonalWorkspace={!!resolvedWorkspace?.personal}
        page={page}
        pageSize={pageSize}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string },
  internalApiOptions: Parameters<typeof listWallets>[1]
) {
  const wallets = await listWallets(wsId, internalApiOptions);
  const normalizedQuery = q?.trim().toLowerCase();
  const filteredWallets = wallets
    .filter((wallet) =>
      normalizedQuery
        ? wallet.name?.toLowerCase().includes(normalizedQuery)
        : true
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const parsedPage = parseInt(page, 10);
  const parsedPageSize = parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedPageSize;

  return {
    data: filteredWallets.slice(start, start + parsedPageSize) as Wallet[],
    allWallets: wallets as Wallet[],
    count: filteredWallets.length,
  };
}
