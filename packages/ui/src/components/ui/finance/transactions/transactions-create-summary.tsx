'use client';

import { CreateDialogFeatureSummary } from '@tuturuuu/ui/finance/shared/create-dialog-feature-summary';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';

interface TransactionsCreateSummaryProps {
  canChangeFinanceWallets: boolean;
  canCreateConfidentialTransactions: boolean;
  canCreateTransactions: boolean;
  canSetFinanceWalletsOnCreate: boolean;
  createDescription: string;
  createTitle: string;
  defaultOpen?: boolean;
  description: string;
  pluralTitle: string;
  singularTitle: string;
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
  description,
  pluralTitle,
  singularTitle,
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
          />
        ) : undefined
      }
    />
  );
}
