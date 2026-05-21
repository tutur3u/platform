import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import ExportDialogContent from '@tuturuuu/ui/finance/transactions/export-dialog-content';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { TransactionsInfinitePage } from '@tuturuuu/ui/finance/transactions/transactions-infinite-page';
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
  currency?: string;
  permissions?: PermissionsResult;
  wsId: string;
  workspace?: {
    personal?: boolean | null;
    timezone?: string | null;
  };
  showTransactionTypeFilter?: boolean;
}

export default async function TransactionsPage({
  currency,
  permissions,
  wsId,
  workspace,
  showTransactionTypeFilter = false,
}: Props) {
  const [t, resolvedWorkspace, resolvedPermissions, resolvedCurrency] =
    await Promise.all([
      getTranslations(),
      workspace ? Promise.resolve(workspace) : getWorkspace(wsId),
      permissions ? Promise.resolve(permissions) : getPermissions({ wsId }),
      currency
        ? Promise.resolve(currency)
        : getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    ]);
  if (!resolvedWorkspace || !resolvedPermissions) return notFound();
  const { containsPermission } = resolvedPermissions;

  const canViewTransactions = containsPermission('view_transactions');
  const canExportFinanceData = containsPermission('export_finance_data');
  const canCreateTransactions = containsPermission('create_transactions');
  const canUpdateTransactions = containsPermission('update_transactions');
  const canDeleteTransactions = containsPermission('delete_transactions');
  const canChangeFinanceWallets = containsPermission('change_finance_wallets');
  const canSetFinanceWalletsOnCreate = containsPermission(
    'set_finance_wallets_on_create'
  );
  const canCreateConfidentialTransactions = containsPermission(
    'create_confidential_transactions'
  );
  const canUpdateConfidentialTransactions = containsPermission(
    'update_confidential_transactions'
  );
  const canDeleteConfidentialTransactions = containsPermission(
    'delete_confidential_transactions'
  );
  const canViewConfidentialAmount = containsPermission(
    'view_confidential_amount'
  );
  const canViewConfidentialDescription = containsPermission(
    'view_confidential_description'
  );
  const canViewConfidentialCategory = containsPermission(
    'view_confidential_category'
  );

  if (!canViewTransactions) return notFound();

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-transactions.plural')}
        singularTitle={t('ws-transactions.singular')}
        description={t('ws-transactions.description')}
        createTitle={t('ws-transactions.create')}
        createDescription={t('ws-transactions.create_description')}
        form={
          canCreateTransactions ? (
            <TransactionForm
              wsId={wsId}
              canCreateTransactions={canCreateTransactions}
              canChangeFinanceWallets={canChangeFinanceWallets}
              canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
              canCreateConfidentialTransactions={
                canCreateConfidentialTransactions
              }
            />
          ) : undefined
        }
      />
      <Separator className="my-4" />
      <TransactionsInfinitePage
        wsId={wsId}
        currency={resolvedCurrency ?? 'USD'}
        timezone={resolvedWorkspace.timezone}
        canExport={canExportFinanceData}
        exportContent={
          <ExportDialogContent wsId={wsId} exportType="transactions" />
        }
        canCreateTransactions={canCreateTransactions}
        canChangeFinanceWallets={canChangeFinanceWallets}
        canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
        canCreateConfidentialTransactions={canCreateConfidentialTransactions}
        canUpdateTransactions={canUpdateTransactions}
        canDeleteTransactions={canDeleteTransactions}
        canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
        canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
        canViewConfidentialAmount={canViewConfidentialAmount}
        canViewConfidentialDescription={canViewConfidentialDescription}
        canViewConfidentialCategory={canViewConfidentialCategory}
        isPersonalWorkspace={!!resolvedWorkspace.personal}
        showTransactionTypeFilter={showTransactionTypeFilter}
      />
    </>
  );
}
