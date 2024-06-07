'use client';

import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/custom/select-field';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { zodResolver } from '@hookform/resolvers/zod';
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
  const { t } = useTranslation('common');

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
        <FormField
          control={form.control}
          name="name"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category name</FormLabel>
              <FormControl>
                <Input placeholder="Cash" {...field} />
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
              <FormLabel>Type</FormLabel>
              <FormControl>
                <SelectField
                  id="category-type"
                  placeholder="Select a type"
                  options={[
                    { value: 'EXPENSE', label: 'Expense' },
                    { value: 'INCOME', label: 'Income' },
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('common:processing') : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
