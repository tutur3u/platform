'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventoryManufacturer,
  type InventoryManufacturer,
  updateInventoryManufacturer,
} from '@tuturuuu/internal-api';
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
  data?: InventoryManufacturer;
  onFinish?: (data: InventoryManufacturer) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

export function ProductManufacturerForm({
  wsId,
  data,
  onFinish,
  canCreateInventory = false,
  canUpdateInventory = false,
}: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    if (!data?.id && !canCreateInventory) {
      toast.error(
        t('ws-roles.inventory_manufacturers_access_denied_description')
      );
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(
        t('ws-roles.inventory_manufacturers_access_denied_description')
      );
      setLoading(false);
      return;
    }

    try {
      const response = data?.id
        ? await updateInventoryManufacturer(wsId, data.id, {
            name: formData.name,
          })
        : await createInventoryManufacturer(wsId, {
            name: formData.name,
          });

      await queryClient.invalidateQueries({
        queryKey: ['product-manufacturers', wsId],
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['inventory-table', 'manufacturers', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-product-form-options', wsId],
        }),
      ]);
      onFinish?.(response.data);
      router.refresh();
    } catch {
      toast.error(
        data?.id
          ? t('ws-inventory-manufacturers.failed_update_manufacturer')
          : t('ws-inventory-manufacturers.failed_create_manufacturer')
      );
    } finally {
      setLoading(false);
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
                <Input
                  placeholder={t('ws-inventory-manufacturers.placeholder')}
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
              ? t('common.edit')
              : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}
