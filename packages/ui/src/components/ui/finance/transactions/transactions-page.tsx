import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import ExportDialogContent from '@tuturuuu/ui/finance/transactions/export-dialog-content';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { TransactionsInfinitePage } from '@tuturuuu/ui/finance/transactions/transactions-infinite-page';
import { Separator } from '@tuturuuu/ui/separator';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
}

export default async function TransactionsPage({ wsId }: Props) {
  const [t, workspace, permissions, currency] = await Promise.all([
    getTranslations(),
    getWorkspace(wsId),
    getPermissions({ wsId }),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
  ]);
  if (!workspace || !permissions) return notFound();
  const { containsPermission } = permissions;

  const canViewTransactions = containsPermission('view_transactions');
  const canExportFinanceData = containsPermission('export_finance_data');
  const canCreateTransactions = containsPermission('create_transactions');
  const canUpdateTransactions = containsPermission('update_transactions');
  const canDeleteTransactions = containsPermission('delete_transactions');
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
        currency={currency ?? 'USD'}
        timezone={workspace.timezone}
        canExport={canExportFinanceData}
        exportContent={
          <ExportDialogContent wsId={wsId} exportType="transactions" />
        }
        canCreateTransactions={canCreateTransactions}
        canCreateConfidentialTransactions={canCreateConfidentialTransactions}
        canUpdateTransactions={canUpdateTransactions}
        canDeleteTransactions={canDeleteTransactions}
        canUpdateConfidentialTransactions={canUpdateConfidentialTransactions}
        canDeleteConfidentialTransactions={canDeleteConfidentialTransactions}
        canViewConfidentialAmount={canViewConfidentialAmount}
        canViewConfidentialDescription={canViewConfidentialDescription}
        canViewConfidentialCategory={canViewConfidentialCategory}
        isPersonalWorkspace={workspace.personal}
      />
    </>
  );
}
