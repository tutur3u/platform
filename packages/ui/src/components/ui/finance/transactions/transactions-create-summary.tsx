'use client';

import { CreateDialogFeatureSummary } from '@tuturuuu/ui/finance/shared/create-dialog-feature-summary';
import {
  type FinancePermissionRequestUser,
  FinancePermissionWarningContent,
} from '@tuturuuu/ui/finance/shared/finance-permission-warning-dialog';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';

interface TransactionsCreateSummaryProps {
  canChangeFinanceWallets: boolean;
  canCreateConfidentialTransactions: boolean;
  canCreateTransactions: boolean;
  canSetFinanceWalletsOnCreate: boolean;
  createDescription: string;
  createTitle: string;
  defaultOpen?: boolean;
  defaultCurrency?: string;
  description: string;
  initialMode?: 'transaction' | 'transfer';
  permissionRequestUser?: FinancePermissionRequestUser | null;
  pluralTitle: string;
  singularTitle: string;
  timezone?: string | null;
  wsId: string;
}

export function TransactionsCreateSummary({
  canChangeFinanceWallets,
  canCreateConfidentialTransactions,
  canCreateTransactions,
  canSetFinanceWalletsOnCreate,
  createDescription,
  createTitle,
  defaultOpen = false,
  defaultCurrency,
  description,
  initialMode = 'transaction',
  permissionRequestUser,
  pluralTitle,
  singularTitle,
  timezone,
  wsId,
}: TransactionsCreateSummaryProps) {
  return (
    <CreateDialogFeatureSummary
      pluralTitle={pluralTitle}
      singularTitle={singularTitle}
      description={description}
      createTitle={createTitle}
      createDescription={createDescription}
      defaultOpen={defaultOpen}
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
            initialMode={initialMode}
            defaultCurrency={defaultCurrency}
            timezone={timezone}
            permissionRequestUser={permissionRequestUser}
          />
        ) : (
          <FinancePermissionWarningContent
            missingPermissions={['create_transactions']}
            user={permissionRequestUser}
          />
        )
      }
    />
  );
}
