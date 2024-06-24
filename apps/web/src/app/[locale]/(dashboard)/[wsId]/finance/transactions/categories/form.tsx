'use client';

import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { SelectField } from '@repo/ui/components/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: TransactionCategory;
  onComplete?: () => void;
  submitLabel?: string;
}

const FormSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['INCOME', 'EXPENSE']),
});

export function TransactionCategoryForm({
  wsId,
  data,
  onComplete,
  submitLabel,
}: Props) {
  const { t } = useTranslation('transaction-category-data-table');

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: data?.name || '',
      type: data?.is_expense === false ? 'INCOME' : 'EXPENSE',
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
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
          name: formData.name,
          is_expense: formData.type === 'EXPENSE',
        }),
      }
    );

    if (res.ok) {
      router.refresh();
      if (onComplete) onComplete();
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
                <FormLabel>{t('category_name')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('name_examples')} {...field} />
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
                <FormLabel>{t('category_type')}</FormLabel>
                <FormControl>
                  <SelectField
                    id="category-type"
                    placeholder={t('select_type')}
                    options={[
                      { value: 'EXPENSE', label: t('expense') },
                      { value: 'INCOME', label: t('income') },
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
          {loading ? t('common:processing') : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
