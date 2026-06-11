'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator } from '@tuturuuu/icons';
import {
  createWalletCheckpointBatch,
  type WalletCheckpointBatchPayload,
} from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useFinanceBalanceMode } from '../../shared/use-finance-balance-mode';
import { invalidateWalletMutationQueries } from '../query-invalidation';
import { WalletCheckpointAmount } from './wallet-checkpoint-amount';

type WalletInput = {
  audit_balance?: number | null;
  audit_status?: 'clean' | 'no_checkpoint' | 'unresolved' | null;
  audit_variance?: number | null;
  balance?: number | null;
  currency: string;
  id: string;
  name?: string | null;
};

export function WalletTotalCheckDialog({
  canUpdateWallets,
  wallets,
  wsId,
}: {
  canUpdateWallets: boolean;
  wallets: WalletInput[];
  wsId: string;
}) {
  const t = useTranslations('wallet-checkpoints');
  const queryClient = useQueryClient();
  const { isAuditedMode } = useFinanceBalanceMode();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: (payload: WalletCheckpointBatchPayload) =>
      createWalletCheckpointBatch(wsId, payload),
    onSuccess: () => {
      toast.success(t('batch_saved'));
      setValues({});
      setOpen(false);
      invalidateWalletMutationQueries(queryClient, wsId);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('batch_error'));
    },
  });
  const totals = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const wallet of wallets) {
      const rawValue = values[wallet.id];
      const amount = rawValue === undefined ? Number.NaN : Number(rawValue);
      if (!Number.isFinite(amount)) continue;
      grouped.set(
        wallet.currency,
        (grouped.get(wallet.currency) ?? 0) + amount
      );
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [values, wallets]);
  const canSubmit =
    wallets.length > 0 &&
    wallets.every((wallet) => Number.isFinite(Number(values[wallet.id])));

  if (!canUpdateWallets) {
    return null;
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Calculator className="mr-2 h-4 w-4" />
        {t('all_wallet_check')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('all_wallet_check')}</DialogTitle>
            <DialogDescription>
              {t('all_wallet_check_description')}
            </DialogDescription>
          </DialogHeader>
          {wallets.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
              {t('no_wallets')}
            </div>
          ) : (
            <div className="grid gap-3">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="grid gap-2 rounded-md border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">
                        {wallet.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {isAuditedMode &&
                        typeof wallet.audit_balance === 'number'
                          ? t('audited_balance')
                          : t('ledger_balance')}
                        :{' '}
                        <WalletCheckpointAmount
                          amount={
                            isAuditedMode &&
                            typeof wallet.audit_balance === 'number'
                              ? wallet.audit_balance
                              : (wallet.balance ?? 0)
                          }
                          currency={wallet.currency}
                        />
                      </div>
                      {typeof wallet.audit_balance === 'number' &&
                        wallet.audit_status !== 'no_checkpoint' && (
                          <div className="text-muted-foreground text-xs">
                            {isAuditedMode
                              ? t('ledger_balance')
                              : t('audited_balance')}
                            :{' '}
                            <WalletCheckpointAmount
                              amount={
                                isAuditedMode
                                  ? (wallet.balance ?? 0)
                                  : wallet.audit_balance
                              }
                              currency={wallet.currency}
                            />
                            {typeof wallet.audit_variance === 'number'
                              ? ` · ${t('variance')}: `
                              : null}
                            {typeof wallet.audit_variance === 'number' && (
                              <WalletCheckpointAmount
                                amount={wallet.audit_variance}
                                currency={wallet.currency}
                                signDisplay="always"
                              />
                            )}
                          </div>
                        )}
                      {isAuditedMode &&
                        wallet.audit_status === 'no_checkpoint' && (
                          <div className="text-muted-foreground text-xs">
                            {t('no_checkpoint_short')}
                          </div>
                        )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {wallet.currency}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`wallet-check-${wallet.id}`}>
                      {t('actual_balance_with_currency', {
                        currency: wallet.currency,
                      })}
                    </Label>
                    <Input
                      id={`wallet-check-${wallet.id}`}
                      inputMode="decimal"
                      value={values[wallet.id] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [wallet.id]: event.target.value,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
              {totals.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="font-medium text-sm">{t('totals')}</div>
                  <div className="mt-2 grid gap-1 text-sm">
                    {totals.map(([currency, total]) => (
                      <div
                        key={currency}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{currency}</span>
                        <span>
                          <WalletCheckpointAmount
                            amount={total}
                            currency={currency}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!canSubmit || mutation.isPending}
              onClick={() => {
                mutation.mutate({
                  checked_at: new Date().toISOString(),
                  entries: wallets.map((wallet) => ({
                    actual_balance: Number(values[wallet.id]),
                    wallet_id: wallet.id,
                  })),
                });
              }}
            >
              {mutation.isPending ? t('saving') : t('save_checkpoints')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
