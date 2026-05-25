'use client';

import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import { RecurringScheduleFields } from './form-schedule-fields';
import { NO_CATEGORY_VALUE, type RecurringFormValues } from './form-schema';

interface RecurringFormFieldsProps {
  categories?: TransactionCategoryWithStats[];
  form: UseFormReturn<RecurringFormValues>;
  t: ReturnType<typeof useTranslations>;
  wallets?: Wallet[];
}

export function RecurringFormFields({
  categories,
  form,
  t,
  wallets,
}: RecurringFormFieldsProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('name')}</FormLabel>
            <FormControl>
              <Input placeholder={t('name_placeholder')} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('description')}</FormLabel>
            <FormControl>
              <Textarea placeholder={t('description_placeholder')} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="wallet_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('wallet')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('select_wallet')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {wallets
                    ?.filter(
                      (wallet): wallet is typeof wallet & { id: string } =>
                        typeof wallet.id === 'string'
                    )
                    .map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('category')}</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || NO_CATEGORY_VALUE}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('select_category')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY_VALUE}>
                    {t('no_category')}
                  </SelectItem>
                  {categories
                    ?.filter(
                      (
                        category
                      ): category is typeof category & { id: string } =>
                        typeof category.id === 'string'
                    )
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <RecurringScheduleFields form={form} t={t} />
    </>
  );
}
