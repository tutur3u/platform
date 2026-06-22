'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventorySupplier,
  updateInventorySupplier,
} from '@tuturuuu/internal-api/inventory';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
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

type ProductSupplierFormProps = {
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
  data?: ProductSupplier;
  onFinish?: (data: ProductSupplierFormValues) => void;
  wsId: string;
};

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

type ProductSupplierFormValues = z.infer<typeof formSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProductSupplierForm({
  canCreateInventory = false,
  canUpdateInventory = false,
  data,
  onFinish,
  wsId,
}: ProductSupplierFormProps) {
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

  async function onSubmit(values: ProductSupplierFormValues) {
    if (!values.id && !canCreateInventory) {
      toast.error(t('ws-roles.inventory_suppliers_access_denied_description'));
      return;
    }

    if (values.id && !canUpdateInventory) {
      toast.error(t('ws-roles.inventory_suppliers_access_denied_description'));
      return;
    }

    setLoading(true);

    try {
      if (values.id) {
        await updateInventorySupplier(wsId, values.id, {
          name: values.name,
        });
      } else {
        await createInventorySupplier(wsId, {
          name: values.name,
        });
      }

      await queryClient.invalidateQueries({
        queryKey: ['inventory-table', 'suppliers', wsId],
      });
      onFinish?.(values);
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.error')));
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
                <Input placeholder={t('basic-data-table.name')} {...field} />
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
