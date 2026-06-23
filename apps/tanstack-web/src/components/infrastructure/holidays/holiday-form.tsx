'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { HolidayFormValues, HolidayManagementRow } from './types';

const holidayFormSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1),
});

type HolidayFormProps = {
  data?: HolidayManagementRow;
  isPending?: boolean;
  mode: 'create' | 'edit';
  onSubmit: (values: HolidayFormValues) => Promise<void> | void;
};

function getDefaultValues(data?: HolidayManagementRow): HolidayFormValues {
  return {
    date: data?.date ?? '',
    name: data?.name ?? '',
  };
}

export function HolidayForm({
  data,
  isPending,
  mode,
  onSubmit,
}: HolidayFormProps) {
  const t = useTranslations('admin-holidays');
  const form = useForm<HolidayFormValues>({
    defaultValues: getDefaultValues(data),
    mode: 'onChange',
    resolver: zodResolver(holidayFormSchema),
  });

  const disabled =
    isPending ||
    form.formState.isSubmitting ||
    !form.formState.isDirty ||
    !form.formState.isValid;

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit({
            date: values.date,
            name: values.name.trim(),
          });
          form.reset(getDefaultValues(data));
        })}
      >
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('date')}</FormLabel>
              <FormControl>
                <Input autoComplete="off" type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  placeholder={t('holiday_name_placeholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" disabled={disabled} type="submit">
          {isPending || form.formState.isSubmitting
            ? mode === 'create'
              ? t('adding')
              : t('loading')
            : mode === 'create'
              ? t('add')
              : t('save')}
        </Button>
      </form>
    </Form>
  );
}
