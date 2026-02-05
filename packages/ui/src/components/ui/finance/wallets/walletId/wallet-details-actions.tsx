'use client';

import { Pencil, Plus } from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WalletDeleteButton } from './wallet-delete-button';

interface WalletDetailsActionsProps {
  wsId: string;
  walletId: string;
  wallet: Wallet;
  canUpdateWallets: boolean;
  canCreateTransactions: boolean;
  canCreateConfidentialTransactions: boolean;
  canDeleteWallets: boolean;
  isPersonalWorkspace: boolean;
}

export function WalletDetailsActions({
  wsId,
  walletId,
  wallet,
  canUpdateWallets,
  canCreateTransactions,
  canCreateConfidentialTransactions,
  canDeleteWallets,
  isPersonalWorkspace,
}: WalletDetailsActionsProps) {
  const t = useTranslations();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);

  const hasAnyAction =
    canUpdateWallets || canCreateTransactions || canDeleteWallets;

  if (!hasAnyAction) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateWallets && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditDialog(true)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('common.edit')}
          </Button>
          <ModifiableDialogTrigger
            data={wallet}
            open={showEditDialog}
            title={t('ws-wallets.edit')}
            editDescription={t('ws-wallets.edit_description')}
            setOpen={setShowEditDialog}
            form={
              <WalletForm
                wsId={wsId}
                data={wallet}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            }
            requireExpansion={!isPersonalWorkspace}
          />
        </>
      )}

      {canCreateTransactions && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTransactionDialog(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('ws-transactions.singular')}
          </Button>
          <ModifiableDialogTrigger
            data={{ wallet_id: walletId }}
            open={showTransactionDialog}
            title={t('ws-transactions.create')}
            createDescription={t('ws-transactions.create_description')}
            setOpen={setShowTransactionDialog}
            forceDefault
            form={
              <TransactionForm
                wsId={wsId}
                canCreateTransactions={canCreateTransactions}
                canCreateConfidentialTransactions={
                  canCreateConfidentialTransactions
                }
              />
            }
          />
        </>
      )}

      {canDeleteWallets && (
        <WalletDeleteButton
          wsId={wsId}
          walletId={walletId}
          walletName={wallet.name ?? undefined}
        />
      )}
    </div>
  );
}
