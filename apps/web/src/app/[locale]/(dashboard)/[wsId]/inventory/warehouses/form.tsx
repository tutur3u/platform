'use client';

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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: ProductWarehouse;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

export function ProductWarehouseForm({
  wsId,
  data,
  onFinish,
  canCreateInventory = false,
  canUpdateInventory = false,
}: Props) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
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
      toast.error(t('ws-roles.inventory_warehouses_access_denied_description'));
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_warehouses_access_denied_description'));
      setLoading(false);
      return;
    }

    const res = await fetch(
      data?.id
        ? `/api/v1/workspaces/${wsId}/product-warehouses/${data.id}`
        : `/api/v1/workspaces/${wsId}/product-warehouses`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
        }),
      }
    );

    if (res.ok) {
      onFinish?.(data);
      router.refresh();
    } else {
      setLoading(false);
      toast.error(t('ws-inventory-warehouses.failed_create_warehouse'));
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
              <FormLabel>{t('basic-data-table.name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('basic-data-table.name')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
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
