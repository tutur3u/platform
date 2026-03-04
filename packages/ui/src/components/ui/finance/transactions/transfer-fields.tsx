'use client';

import { ArrowRightLeft, Pencil, RefreshCw, Sparkles } from '@tuturuuu/icons';
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
import { useMemo, useState } from 'react';

interface TransferFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  wallets: WalletType[] | undefined;
  loading: boolean;
  hasFormPermission: boolean;
  suggestedExchangeRate?: number | null;
  isDestinationOverridden: boolean;
  onToggleDestinationOverride: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any) => string;
}

/**
 * Renders cross-currency transfer fields (destination amount + exchange rate).
 * Only visible when a destination wallet is selected.
 *
 * When `isDestinationOverridden` is false and a suggested exchange rate is
 * available, the destination amount field is disabled and auto-filled by the
 * parent. The user can click the "Auto" badge to switch to manual override mode.
 */
export function TransferFields({
  form,
  wallets,
  loading,
  hasFormPermission,
  suggestedExchangeRate,
  isDestinationOverridden,
  onToggleDestinationOverride,
  t,
}: TransferFieldsProps) {
  const originWalletId = form.watch('origin_wallet_id');
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

  // Field is auto-managed when: cross-currency, not overridden, and DB rate available
  const isAutoMode =
    isCrossCurrency && !isDestinationOverridden && !!suggestedExchangeRate;

  const effectiveRate = useMemo(() => {
    if (!isCrossCurrency) return null;
    if (suggestedExchangeRate && suggestedExchangeRate > 0) {
      return suggestedExchangeRate;
    }
    // Fallback: derive from typed amounts when no DB rate is available
    if (sourceAmount && destinationAmount && sourceAmount > 0) {
      return destinationAmount / sourceAmount;
    }
    return null;
  }, [isCrossCurrency, suggestedExchangeRate, sourceAmount, destinationAmount]);

  const [isRateInverted, setIsRateInverted] = useState(false);

  const exchangeRateDisplay = useMemo(() => {
    if (!effectiveRate || !Number.isFinite(effectiveRate)) return null;
    const originCur = originWallet?.currency || '';
    const destCur = destWallet?.currency || '';
    if (isRateInverted) {
      const invRate = 1 / effectiveRate;
      return `1 ${destCur} = ${invRate.toFixed(4)} ${originCur}`;
    }
    return `1 ${originCur} = ${effectiveRate.toFixed(4)} ${destCur}`;
  }, [
    effectiveRate,
    originWallet?.currency,
    destWallet?.currency,
    isRateInverted,
  ]);

  if (!destinationWalletId) return null;

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="destination_amount"
        disabled={loading || !hasFormPermission}
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>
                {t('transaction-data-table.destination_amount')}
              </FormLabel>
              {isCrossCurrency && (
                <button
                  type="button"
                  onClick={onToggleDestinationOverride}
                  disabled={loading || !hasFormPermission}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs transition-colors',
                    isDestinationOverridden
                      ? 'bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20'
                      : 'bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                  )}
                >
                  {isDestinationOverridden ? (
                    <>
                      <Pencil className="h-3 w-3" />
                      {t('transaction-data-table.destination_override')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Auto
                    </>
                  )}
                </button>
              )}
            </div>
            <FormControl>
              <CurrencyInput
                value={field.value}
                onChange={field.onChange}
                disabled={field.disabled || isAutoMode}
                placeholder="0"
                currencySuffix={destWallet?.currency}
              />
            </FormControl>
            {isCrossCurrency && (
              <FormDescription>
                {isDestinationOverridden
                  ? t('transaction-data-table.destination_override_hint')
                  : t('transaction-data-table.destination_auto_hint')}
              </FormDescription>
            )}
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
          <button
            type="button"
            onClick={() => setIsRateInverted((v) => !v)}
            title={t('transaction-data-table.invert_rate')}
            aria-label={t('transaction-data-table.invert_rate')}
            className={cn(
              'ml-auto rounded-md p-1 transition-colors',
              'hover:bg-dynamic-blue/15 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/50'
            )}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
