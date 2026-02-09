'use client';

import { RefreshCw } from '@tuturuuu/icons';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { CurrencyInput } from '@tuturuuu/ui/currency-input';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

interface TransferFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  wallets: WalletType[] | undefined;
  loading: boolean;
  hasFormPermission: boolean;
  originWalletId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}

/**
 * Renders cross-currency transfer fields (destination amount + exchange rate).
 * Only visible when source and destination wallets have different currencies.
 * The destination wallet picker itself lives in the parent form grid.
 */
export function TransferFields({
  form,
  wallets,
  loading,
  hasFormPermission,
  originWalletId,
  t,
}: TransferFieldsProps) {
  const destinationWalletId = form.watch('destination_wallet_id');
  const destinationAmount = form.watch('destination_amount');
  const sourceAmount = form.watch('amount');

  const originWallet = useMemo(
    () => wallets?.find((w) => w.id === originWalletId),
    [wallets, originWalletId]
  );

  const destWallet = useMemo(
    () => wallets?.find((w) => w.id === destinationWalletId),
    [wallets, destinationWalletId]
  );

  const isCrossCurrency = useMemo(() => {
    if (!originWallet?.currency || !destWallet?.currency) return false;
    return (
      originWallet.currency.toUpperCase() !== destWallet.currency.toUpperCase()
    );
  }, [originWallet?.currency, destWallet?.currency]);

  const exchangeRateDisplay = useMemo(() => {
    if (!isCrossCurrency || !sourceAmount || !destinationAmount) return null;
    const rate = destinationAmount / sourceAmount;
    return `1 ${originWallet?.currency || ''} = ${rate.toFixed(4)} ${destWallet?.currency || ''}`;
  }, [
    isCrossCurrency,
    sourceAmount,
    destinationAmount,
    originWallet?.currency,
    destWallet?.currency,
  ]);

  if (!isCrossCurrency || !destinationWalletId) return null;

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="destination_amount"
        disabled={loading || !hasFormPermission}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {t('transaction-data-table.destination_amount')}
            </FormLabel>
            <FormControl>
              <CurrencyInput
                value={field.value}
                onChange={field.onChange}
                disabled={field.disabled}
                placeholder="0"
                currencySuffix={destWallet?.currency}
              />
            </FormControl>
            <FormDescription>
              {t('transaction-data-table.cross_currency_note')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {exchangeRateDisplay && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-2',
            'text-dynamic-blue text-sm'
          )}
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">
            {t('transaction-data-table.exchange_rate')}:
          </span>
          <span className="tabular-nums">{exchangeRateDisplay}</span>
        </div>
      )}
    </div>
  );
}
