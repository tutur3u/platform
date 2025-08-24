'use client';

import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import { Button } from '@tuturuuu/ui/button';
import { SelectField } from '@tuturuuu/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: TransactionCategory;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  type: z.string(),
  // type: z.enum(['INCOME', 'EXPENSE']),
});

export function TransactionCategoryForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
      type: data?.is_expense === false ? 'INCOME' : 'EXPENSE',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/transactions/categories/${data.id}`
        : `/api/workspaces/${wsId}/transactions/categories`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          is_expense: data.type === 'EXPENSE',
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating category',
        description: 'An error occurred while creating the category',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <div className="grid gap-2 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            disabled={loading}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('transaction-category-data-table.category_name')}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      'transaction-category-data-table.name_examples'
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>
                  {t('transaction-category-data-table.category_type')}
                </FormLabel>
                <FormControl>
                  <SelectField
                    id="category-type"
                    placeholder={t(
                      'transaction-category-data-table.select_type'
                    )}
                    options={[
                      {
                        value: 'EXPENSE',
                        label: t('transaction-category-data-table.expense'),
                      },
                      {
                        value: 'INCOME',
                        label: t('transaction-category-data-table.income'),
                      },
                    ]}
                    classNames={{ root: 'w-full' }}
                    {...field}
                    onValueChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="h-2" />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : data?.id
              ? t('ws-transaction-categories.edit')
              : t('ws-transaction-categories.create')}
        </Button>
      </form>
    </Form>
  );
}
