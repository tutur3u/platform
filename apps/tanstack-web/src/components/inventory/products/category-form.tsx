'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventoryProductCategory,
  updateInventoryProductCategory,
} from '@tuturuuu/internal-api';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { useRouter } from '../../../lib/platform/next-navigation-shim';

interface Props {
  wsId: string;
  data?: ProductCategory;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

export function ProductCategoryForm({
  wsId,
  data,
  onFinish,
  canCreateInventory = false,
  canUpdateInventory = false,
}: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);

    // Check permissions before proceeding
    if (!data?.id && !canCreateInventory) {
      toast.error(t('ws-roles.inventory_categories_access_denied_description'));
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_categories_access_denied_description'));
      setLoading(false);
      return;
    }

    try {
      await (data?.id
        ? updateInventoryProductCategory(wsId, data.id, {
            name: data.name,
          })
        : createInventoryProductCategory(wsId, {
            name: data.name,
          }));

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['inventory-table', 'categories', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-product-form-options', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['product-categories', wsId],
        }),
      ]);
      onFinish?.(data);
      router.refresh();
    } catch {
      setLoading(false);
      toast.error(t('common.error'));
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
              <FormLabel>
                {t('transaction-category-data-table.category_name')}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={t(
                    'transaction-category-data-table.category_name'
                  )}
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
