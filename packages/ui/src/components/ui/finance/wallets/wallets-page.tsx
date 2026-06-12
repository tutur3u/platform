import { FinanceBalanceModeToggle } from '@tuturuuu/ui/finance/shared/balance-mode-toggle';
import { CreateDialogFeatureSummary } from '@tuturuuu/ui/finance/shared/create-dialog-feature-summary';
import { FinanceNumbersVisibilityToggle } from '@tuturuuu/ui/finance/shared/numbers-visibility-toggle';
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
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    create?: string;
    q?: string;
  };
  currency?: string;
  financePrefix?: string;
  openCreateDialog?: boolean;
  permissions?: PermissionsResult;
  workspace?: {
    personal?: boolean | null;
  };
}

export default async function WalletsPage({
  wsId,
  searchParams,
  currency,
  financePrefix = '/finance',
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
  const isCreditCardCreate = searchParams.create === 'credit-card';

  return (
    <>
      <CreateDialogFeatureSummary
        pluralTitle={t('ws-wallets.plural')}
        singularTitle={t('ws-wallets.singular')}
        description={t('ws-wallets.description')}
        createTitle={t('ws-wallets.create')}
        createDescription={t('ws-wallets.create_description')}
        defaultOpen={
          openCreateDialog ||
          searchParams.create === 'wallet' ||
          isCreditCardCreate
        }
        form={
          canCreateWallets ? (
            <WalletForm
              wsId={wsId}
              defaultType={isCreditCardCreate ? 'CREDIT' : 'STANDARD'}
            />
          ) : undefined
        }
      />
      <Separator className="my-4" />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <FinanceBalanceModeToggle />
          <FinanceNumbersVisibilityToggle />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <WalletCheckpointHistoryDialog
            wsId={wsId}
            financePrefix={financePrefix}
            canCreateTransactions={canCreateTransactions}
          />
          <WalletTotalCheckDialog
            wsId={wsId}
            currency={resolvedCurrency ?? 'USD'}
            canUpdateWallets={canUpdateWallets}
          />
        </div>
      </div>
      <WalletsDataTable
        wsId={wsId}
        canUpdateWallets={canUpdateWallets}
        canDeleteWallets={canDeleteWallets}
        currency={resolvedCurrency ?? 'USD'}
        financePrefix={financePrefix}
        isPersonalWorkspace={!!resolvedWorkspace?.personal}
        query={searchParams.q}
      />
    </>
  );
}
