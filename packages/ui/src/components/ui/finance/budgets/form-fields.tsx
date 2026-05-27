'use client';

import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import { Button } from '@tuturuuu/ui/button';
import {
  FormControl,
  FormDescription,
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
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import {
  type BudgetFormValues,
  NO_CATEGORY_VALUE,
  NO_WALLET_VALUE,
} from './form-schema';

interface BudgetFormSectionProps {
  form: UseFormReturn<BudgetFormValues>;
}

interface BudgetScopeFieldsProps extends BudgetFormSectionProps {
  categories: TransactionCategoryWithStats[];
  isLoadingCategories: boolean;
  isLoadingWallets: boolean;
  wallets: Wallet[];
}

export function BudgetBasicsFields({ form }: BudgetFormSectionProps) {
  const t = useTranslations('finance-budgets');

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
    </>
  );
}

export function BudgetAmountFields({ form }: BudgetFormSectionProps) {
  const t = useTranslations('finance-budgets');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField
        control={form.control}
        name="amount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('budget_amount')}</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                placeholder="1000.00"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="alert_threshold"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('alert_threshold')}</FormLabel>
            <FormControl>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="80"
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t('alert_threshold_description')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function BudgetPeriodField({ form }: BudgetFormSectionProps) {
  const t = useTranslations('finance-budgets');

  return (
    <FormField
      control={form.control}
      name="period"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('period')}</FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={t('select_period')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="monthly">{t('monthly')}</SelectItem>
              <SelectItem value="yearly">{t('yearly')}</SelectItem>
              <SelectItem value="custom">{t('custom')}</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function BudgetScopeFields({
  categories,
  form,
  isLoadingCategories,
  isLoadingWallets,
  wallets,
}: BudgetScopeFieldsProps) {
  const t = useTranslations('finance-budgets');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField
        control={form.control}
        name="category_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('category')}</FormLabel>
            <Select
              onValueChange={field.onChange}
              defaultValue={field.value || NO_CATEGORY_VALUE}
              disabled={isLoadingCategories}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingCategories
                        ? t('loading_categories')
                        : t('all_categories')
                    }
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_CATEGORY_VALUE}>
                  {t('all_categories')}
                </SelectItem>
                {categories
                  .filter((category) => category.id)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id as string}>
                      {category.name || t('unnamed_category')}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <FormDescription>{t('category_description')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="wallet_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('wallet')}</FormLabel>
            <Select
              onValueChange={field.onChange}
              defaultValue={field.value || NO_WALLET_VALUE}
              disabled={isLoadingWallets}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isLoadingWallets ? t('loading_wallets') : t('all_wallets')
                    }
                  />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_WALLET_VALUE}>
                  {t('all_wallets')}
                </SelectItem>
                {wallets
                  .filter((wallet) => wallet.id)
                  .map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id as string}>
                      {wallet.name || t('unnamed_wallet')}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <FormDescription>{t('wallet_description')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function BudgetDateFields({ form }: BudgetFormSectionProps) {
  const t = useTranslations('finance-budgets');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField
        control={form.control}
        name="start_date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('start_date')}</FormLabel>
            <FormControl>
              <Input type="date" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="end_date"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('end_date')}</FormLabel>
            <FormControl>
              <Input type="date" {...field} />
            </FormControl>
            <FormDescription>{t('end_date_description')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function BudgetSubmitButton({
  isEditing,
  isPending,
}: {
  isEditing: boolean;
  isPending: boolean;
}) {
  const t = useTranslations('finance-budgets');

  return (
    <div className="flex justify-end gap-2">
      <Button type="submit" disabled={isPending}>
        {isEditing ? t('update') : t('create')}
      </Button>
    </div>
  );
}
