'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventoryWarehouse,
  updateInventoryWarehouse,
} from '@tuturuuu/internal-api/inventory';
import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
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
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';
import { useRouter } from '../../lib/platform/next-navigation-shim';

type ProductWarehouseFormProps = {
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
  data?: ProductWarehouse;
  onFinish?: (data: ProductWarehouseFormValues) => void;
  wsId: string;
};

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

type ProductWarehouseFormValues = z.infer<typeof formSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProductWarehouseForm({
  canCreateInventory = false,
  canUpdateInventory = false,
  data,
  onFinish,
  wsId,
}: ProductWarehouseFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
    },
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(values: ProductWarehouseFormValues) {
    if (!values.id && !canCreateInventory) {
      toast.error(t('ws-roles.inventory_warehouses_access_denied_description'));
      return;
    }

    if (values.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_warehouses_access_denied_description'));
      return;
    }

    setLoading(true);

    try {
      if (values.id) {
        await updateInventoryWarehouse(wsId, values.id, {
          name: values.name,
        });
      } else {
        await createInventoryWarehouse(wsId, {
          name: values.name,
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['inventory-table', 'warehouses', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-product-form-options', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['product-warehouses', wsId],
        }),
      ]);
      onFinish?.(values);
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t('ws-inventory-warehouses.failed_create_warehouse')
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          disabled={loading}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('basic-data-table.name')}</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  placeholder={t('basic-data-table.name')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" disabled={loading} type="submit">
          {loading
            ? t('common.processing')
            : data?.id
              ? t('common.edit')
              : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}
