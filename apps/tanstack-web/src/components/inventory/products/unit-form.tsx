'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventoryUnit,
  updateInventoryUnit,
} from '@tuturuuu/internal-api';
import type { ProductUnit } from '@tuturuuu/types/primitives/ProductUnit';
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
  data?: ProductUnit;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

export function ProductUnitForm({
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
      toast.error(t('ws-roles.inventory_units_access_denied_description'));
      setLoading(false);
      return;
    }

    if (data?.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_units_access_denied_description'));
      setLoading(false);
      return;
    }

    try {
      await (data?.id
        ? updateInventoryUnit(wsId, data.id, {
            name: data.name,
          })
        : createInventoryUnit(wsId, {
            name: data.name,
          }));

      await queryClient.invalidateQueries({
        queryKey: ['product-units', wsId],
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['inventory-table', 'units', wsId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-product-form-options', wsId],
        }),
      ]);
      onFinish?.(data);
      router.refresh();
    } catch {
      toast.error(
        data?.id
          ? t('ws-inventory-units.failed_update_unit')
          : t('ws-inventory-units.failed_create_unit')
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
                  placeholder={t('basic-data-table.name')}
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
