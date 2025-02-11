'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { TransactionCategory } from '@tutur3u/types/primitives/TransactionCategory';
import { Button } from '@tutur3u/ui/button';
import { SelectField } from '@tutur3u/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/form';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Input } from '@tutur3u/ui/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: TransactionCategory;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['INCOME', 'EXPENSE']),
});

export function TransactionCategoryForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
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
            : !!data?.id
              ? t('ws-transaction-categories.edit')
              : t('ws-transaction-categories.create')}
        </Button>
      </form>
    </Form>
  );
}
