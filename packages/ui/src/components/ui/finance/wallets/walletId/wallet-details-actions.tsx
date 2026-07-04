'use client';

import {
  ArrowLeftRight,
  CreditCard,
  Pencil,
  Plus,
  RotateCcw,
} from '@tuturuuu/icons';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import type { FinancePermissionRequestUser } from '@tuturuuu/ui/finance/shared/finance-permission-warning-dialog';
import { TransactionForm } from '@tuturuuu/ui/finance/transactions/form';
import { WalletForm } from '@tuturuuu/ui/finance/wallets/form';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WalletDeleteButton } from './wallet-delete-button';

export type WalletDetailsAction = 'charge' | 'payment' | 'credit' | 'edit';

type WalletTransactionAction =
  | Exclude<WalletDetailsAction, 'edit'>
  | 'transaction';

interface WalletDetailsActionsProps {
  wsId: string;
  walletId: string;
  wallet: Wallet;
  initialAction?: WalletDetailsAction | null;
  canUpdateWallets: boolean;
  canCreateTransactions: boolean;
  canCreateConfidentialTransactions: boolean;
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
  canDeleteWallets: boolean;
  isPersonalWorkspace: boolean;
  defaultCurrency?: string;
  timezone?: string | null;
  permissionRequestUser?: FinancePermissionRequestUser | null;
}

export function WalletDetailsActions({
  wsId,
  walletId,
  wallet,
  initialAction,
  canUpdateWallets,
  canCreateTransactions,
  canCreateConfidentialTransactions,
  canChangeFinanceWallets,
  canSetFinanceWalletsOnCreate,
  canDeleteWallets,
  isPersonalWorkspace,
  defaultCurrency,
  timezone,
  permissionRequestUser,
}: WalletDetailsActionsProps) {
  const t = useTranslations();

  const initialTransactionAction =
    initialAction && initialAction !== 'edit' ? initialAction : null;
  const [showEditDialog, setShowEditDialog] = useState(
    initialAction === 'edit'
  );
  const [transactionAction, setTransactionAction] =
    useState<WalletTransactionAction | null>(initialTransactionAction);

  const hasAnyAction =
    canUpdateWallets || canCreateTransactions || canDeleteWallets;

  if (!hasAnyAction) return null;

  const isCreditWallet = wallet.type === 'CREDIT';
  const transactionDialogOpen = transactionAction !== null;
  const transactionDialogTitle =
    transactionAction === 'charge'
      ? t('wallet-data-table.credit_charge')
      : transactionAction === 'payment'
        ? t('wallet-data-table.credit_payment')
        : transactionAction === 'credit'
          ? t('wallet-data-table.credit_refund')
          : t('ws-transactions.create');
  const transactionDialogDescription =
    transactionAction === 'charge'
      ? t('wallet-data-table.credit_charge_description')
      : transactionAction === 'payment'
        ? t('wallet-data-table.credit_payment_description')
        : transactionAction === 'credit'
          ? t('wallet-data-table.credit_refund_description')
          : t('ws-transactions.create_description');

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
                defaultCurrency={defaultCurrency}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            }
            requireExpansion={!isPersonalWorkspace}
          />
        </>
      )}

      {canCreateTransactions && (
        <>
          {isCreditWallet ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransactionAction('charge')}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {t('wallet-data-table.credit_charge')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransactionAction('payment')}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                {t('wallet-data-table.credit_payment')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransactionAction('credit')}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('wallet-data-table.credit_refund')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransactionAction('transaction')}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('ws-transactions.singular')}
            </Button>
          )}
          <ModifiableDialogTrigger
            open={transactionDialogOpen}
            title={transactionDialogTitle}
            createDescription={transactionDialogDescription}
            setOpen={(open) =>
              setTransactionAction(open ? transactionAction : null)
            }
            forceDefault
            form={
              <TransactionForm
                wsId={wsId}
                initialMode={
                  transactionAction === 'payment' ? 'transfer' : 'transaction'
                }
                initialTransaction={
                  transactionAction === 'charge'
                    ? {
                        categoryKind: 'expense',
                        description: t(
                          'wallet-data-table.credit_charge_default_description'
                        ),
                        origin_wallet_id: walletId,
                      }
                    : transactionAction === 'credit'
                      ? {
                          categoryKind: 'income',
                          description: t(
                            'wallet-data-table.credit_refund_default_description'
                          ),
                          origin_wallet_id: walletId,
                        }
                      : transactionAction === 'transaction'
                        ? {
                            origin_wallet_id: walletId,
                          }
                        : undefined
                }
                initialTransfer={
                  transactionAction === 'payment'
                    ? {
                        description: t(
                          'wallet-data-table.credit_payment_default_description'
                        ),
                        destination_wallet_id: walletId,
                      }
                    : undefined
                }
                canCreateTransactions={canCreateTransactions}
                canChangeFinanceWallets={canChangeFinanceWallets}
                canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
                canCreateConfidentialTransactions={
                  canCreateConfidentialTransactions
                }
                defaultCurrency={defaultCurrency}
                timezone={timezone}
                preferInitialWalletSelection={transactionAction !== 'payment'}
                refreshPageOnFinish
                permissionRequestUser={permissionRequestUser}
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
