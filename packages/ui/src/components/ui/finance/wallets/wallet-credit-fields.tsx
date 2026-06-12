'use client';

import { CreditCard } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import type { WalletFormValues } from './form';

interface WalletCreditFieldsProps {
  currency?: string;
  form: UseFormReturn<WalletFormValues>;
  loading: boolean;
}

export function WalletCreditFields({
  currency,
  form,
  loading,
}: WalletCreditFieldsProps) {
  const t = useTranslations();
  const resolvedCurrency = currency || 'USD';

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <CreditCard className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium text-sm">
            {t('wallet-data-table.credit_details')}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('wallet-data-table.credit_details_description')}
          </p>
        </div>
      </div>

      <FormField
        control={form.control}
        name="limit"
        disabled={loading}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('wallet-data-table.credit_limit')}</FormLabel>
            <FormControl>
              <CurrencyInput
                value={field.value}
                onChange={(value) =>
                  field.onChange(value > 0 ? value : undefined)
                }
                disabled={field.disabled}
                placeholder="0"
                currencySuffix={resolvedCurrency}
                locale={getCurrencyLocale(resolvedCurrency)}
                hideHelpers
              />
            </FormControl>
            <FormDescription>
              {t('wallet-data-table.credit_limit_hint')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="statement_date"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.statement_date')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="1"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isNaN(value) ? undefined : value);
                  }}
                />
              </FormControl>
              <FormDescription>
                {t('wallet-data-table.statement_date_hint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="payment_date"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet-data-table.payment_date')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="15"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isNaN(value) ? undefined : value);
                  }}
                />
              </FormControl>
              <FormDescription>
                {t('wallet-data-table.payment_date_hint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
