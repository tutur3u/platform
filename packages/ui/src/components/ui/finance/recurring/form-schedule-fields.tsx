'use client';

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
import type { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import type { RecurringFormValues } from './form-schema';

interface RecurringScheduleFieldsProps {
  form: UseFormReturn<RecurringFormValues>;
  t: ReturnType<typeof useTranslations>;
}

export function RecurringScheduleFields({
  form,
  t,
}: RecurringScheduleFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('amount')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('amount_placeholder')}
                  step="0.01"
                  type="number"
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('amount_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('frequency')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('select_frequency')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="daily">{t('daily')}</SelectItem>
                  <SelectItem value="weekly">{t('weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('monthly')}</SelectItem>
                  <SelectItem value="yearly">{t('yearly')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

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
    </>
  );
}
