'use client';

import { CalendarIcon, PlusIcon } from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { CurrencyInput } from '@tuturuuu/ui/currency-input';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { getIconComponentByKey } from '@tuturuuu/ui/custom/icon-picker';
import {
  getCategoryIcon,
  getWalletIcon,
} from '@tuturuuu/ui/finance/transactions/form-utils';
import { TransferFields } from '@tuturuuu/ui/finance/transactions/transfer-fields';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import type { TransactionFormValues } from './form-schema';
import type { NewContent, NewContentType } from './form-types';

interface FormBasicTabProps {
  form: UseFormReturn<TransactionFormValues>;
  locale: string;
  wallets: WalletType[] | undefined;
  walletsLoading: boolean;
  categories: TransactionCategory[] | undefined;
  categoriesLoading: boolean;
  selectedWalletId: string | undefined;
  selectedWalletCurrency: string | undefined;
  loading: boolean;
  hasFormPermission: boolean;
  isTransfer: boolean;
  suggestedExchangeRate: number | null;
  isDestinationOverridden: boolean;
  setIsDestinationOverridden: (value: boolean) => void;
  setNewContentType: (value: NewContentType) => void;
  setNewContent: (value: NewContent) => void;
  walletPrefillMeta?: {
    value: string;
    sourceLabel: string;
  } | null;
  categoryPrefillMeta?: {
    value: string;
    sourceLabel: string;
  } | null;
}

export function FormBasicTab({
  form,
  locale,
  wallets,
  walletsLoading,
  categories,
  categoriesLoading,
  selectedWalletId,
  selectedWalletCurrency,
  loading,
  hasFormPermission,
  isTransfer,
  suggestedExchangeRate,
  isDestinationOverridden,
  setIsDestinationOverridden,
  setNewContentType,
  setNewContent,
  walletPrefillMeta,
  categoryPrefillMeta,
}: FormBasicTabProps) {
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="origin_wallet_id"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('transaction-data-table.wallet')}</FormLabel>
              <Combobox
                t={t}
                {...field}
                mode="single"
                options={
                  wallets
                    ? wallets.map((wallet) => ({
                        value: wallet.id || '',
                        label: wallet.name || '',
                        icon: getWalletIcon(wallet, getIconComponentByKey),
                      }))
                    : []
                }
                label={walletsLoading ? 'Loading...' : undefined}
                placeholder={t('transaction-data-table.select_wallet')}
                selected={field.value ?? ''}
                onChange={field.onChange}
                actions={[
                  {
                    key: 'add-wallet',
                    label: t('common.add'),
                    icon: <PlusIcon className="h-4 w-4 shrink-0" />,
                    onSelect: () => {
                      setNewContentType('wallet');
                      setNewContent({ name: '' });
                    },
                  },
                ]}
                actionsPosition="top"
                disabled={loading || walletsLoading || !hasFormPermission}
              />
              {walletPrefillMeta &&
                field.value === walletPrefillMeta.value &&
                walletPrefillMeta.sourceLabel && (
                  <FormDescription className="text-xs">
                    {t('transaction-data-table.prefill_hint', {
                      source: walletPrefillMeta.sourceLabel,
                    })}
                  </FormDescription>
                )}
              <FormMessage />
            </FormItem>
          )}
        />

        {isTransfer ? (
          <FormField
            control={form.control}
            name="destination_wallet_id"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>
                  {t('transaction-data-table.destination_wallet')}
                </FormLabel>
                <Combobox
                  t={t}
                  {...field}
                  mode="single"
                  options={
                    wallets
                      ? wallets
                          .filter((w) => w.id !== selectedWalletId)
                          .map((wallet) => ({
                            value: wallet.id || '',
                            label: wallet.name || '',
                            icon: getWalletIcon(wallet, getIconComponentByKey),
                          }))
                      : []
                  }
                  label={walletsLoading ? 'Loading...' : undefined}
                  placeholder={t(
                    'transaction-data-table.select_destination_wallet'
                  )}
                  selected={field.value ?? ''}
                  onChange={field.onChange}
                  actions={[
                    {
                      key: 'add-destination-wallet',
                      icon: <PlusIcon className="h-4 w-4 shrink-0" />,
                      label: t('common.add'),
                      onSelect: () => {
                        setNewContentType('wallet');
                        setNewContent({ name: '' });
                      },
                    },
                  ]}
                  actionsPosition="top"
                  disabled={loading || walletsLoading || !hasFormPermission}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{t('transaction-data-table.category')}</FormLabel>
                <Combobox
                  t={t}
                  {...field}
                  mode="single"
                  options={
                    categories
                      ? categories.map((category) => ({
                          value: category.id || '',
                          label: category.name || '',
                          icon: getCategoryIcon(
                            category,
                            getIconComponentByKey
                          ),
                          color: category.color
                            ? computeAccessibleLabelStyles(category.color)?.text
                            : undefined,
                        }))
                      : []
                  }
                  label={categoriesLoading ? 'Loading...' : undefined}
                  placeholder={t('transaction-data-table.select_category')}
                  selected={field.value ?? ''}
                  onChange={field.onChange}
                  actions={[
                    {
                      key: 'add-category',
                      icon: <PlusIcon className="h-4 w-4 shrink-0" />,
                      label: t('common.add'),
                      onSelect: () => {
                        setNewContentType('transaction-category');
                        setNewContent({ name: '' });
                      },
                    },
                  ]}
                  actionsPosition="top"
                  disabled={loading || categoriesLoading || !hasFormPermission}
                />
                {categoryPrefillMeta &&
                  field.value === categoryPrefillMeta.value &&
                  categoryPrefillMeta.sourceLabel && (
                    <FormDescription className="text-xs">
                      {t('transaction-data-table.prefill_hint', {
                        source: categoryPrefillMeta.sourceLabel,
                      })}
                    </FormDescription>
                  )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      <FormField
        control={form.control}
        name="amount"
        disabled={loading || !hasFormPermission}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('transaction-data-table.amount')}</FormLabel>
            <FormControl>
              <CurrencyInput
                value={field.value}
                onChange={field.onChange}
                disabled={field.disabled}
                placeholder="0"
                currencySuffix={selectedWalletCurrency}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {isTransfer && (
        <TransferFields
          form={form}
          wallets={wallets}
          loading={loading}
          hasFormPermission={hasFormPermission}
          suggestedExchangeRate={suggestedExchangeRate}
          isDestinationOverridden={isDestinationOverridden}
          onToggleDestinationOverride={() =>
            setIsDestinationOverridden(!isDestinationOverridden)
          }
          t={t}
        />
      )}

      <FormField
        control={form.control}
        name="description"
        disabled={loading || !hasFormPermission}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('transaction-data-table.description')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t(
                  'transaction-data-table.description_placeholder'
                )}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Popover>
        <FormField
          control={form.control}
          name="taken_at"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('transaction-data-table.taken_at')}</FormLabel>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    className="pl-3 text-left font-normal"
                    disabled={!hasFormPermission}
                  >
                    {field.value ? (
                      format(
                        field.value,
                        locale === 'vi' ? 'dd/MM/yyyy, ppp' : 'PPP',
                        {
                          locale: locale === 'vi' ? vi : enUS,
                        }
                      )
                    ) : (
                      <span>{t('transaction-data-table.taken_at')}</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={field.value}
                  onSelect={field.onChange}
                  onSubmit={field.onChange}
                  initialFocus
                />
              </PopoverContent>
              <FormMessage />
            </FormItem>
          )}
        />
      </Popover>
    </div>
  );
}
