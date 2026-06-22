'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createInventoryManufacturer,
  createInventoryProductCategory,
  createInventoryUnit,
  updateInventoryManufacturer,
  updateInventoryProductCategory,
  updateInventoryUnit,
} from '@tuturuuu/internal-api/inventory';
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

export type InventoryNamedResourceKind =
  | 'categories'
  | 'manufacturers'
  | 'units';

export type InventoryNamedResourceRow = {
  created_at?: string | null;
  id: string;
  name?: string | null;
  ws_id?: string | null;
};

type InventoryNamedResourceFormProps = {
  canCreateInventory?: boolean;
  canUpdateInventory?: boolean;
  data?: InventoryNamedResourceRow;
  kind: InventoryNamedResourceKind;
  onFinish?: (data: InventoryNamedResourceFormValues) => void;
  wsId: string;
};

type ResourceFormConfig = {
  accessDeniedKey: string;
  createErrorKey: string;
  createKey: string;
  labelKey: string;
  placeholderKey: string;
  queryKeys: string[];
  updateErrorKey: string;
};

const resourceFormConfigs = {
  categories: {
    accessDeniedKey: 'ws-roles.inventory_categories_access_denied_description',
    createErrorKey: 'common.error',
    createKey: 'ws-transaction-categories.create',
    labelKey: 'transaction-category-data-table.category_name',
    placeholderKey: 'transaction-category-data-table.category_name',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-categories',
    ],
    updateErrorKey: 'common.error',
  },
  manufacturers: {
    accessDeniedKey:
      'ws-roles.inventory_manufacturers_access_denied_description',
    createErrorKey: 'ws-inventory-manufacturers.failed_create_manufacturer',
    createKey: 'common.create',
    labelKey: 'basic-data-table.name',
    placeholderKey: 'ws-inventory-manufacturers.placeholder',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-manufacturers',
    ],
    updateErrorKey: 'ws-inventory-manufacturers.failed_update_manufacturer',
  },
  units: {
    accessDeniedKey: 'ws-roles.inventory_units_access_denied_description',
    createErrorKey: 'ws-inventory-units.failed_create_unit',
    createKey: 'common.create',
    labelKey: 'basic-data-table.name',
    placeholderKey: 'basic-data-table.name',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-units',
    ],
    updateErrorKey: 'ws-inventory-units.failed_update_unit',
  },
} satisfies Record<InventoryNamedResourceKind, ResourceFormConfig>;

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
});

type InventoryNamedResourceFormValues = z.infer<typeof formSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function createNamedResource(
  kind: InventoryNamedResourceKind,
  wsId: string,
  values: InventoryNamedResourceFormValues
) {
  if (kind === 'categories') {
    return createInventoryProductCategory(wsId, { name: values.name });
  }
  if (kind === 'manufacturers') {
    return createInventoryManufacturer(wsId, { name: values.name });
  }
  return createInventoryUnit(wsId, { name: values.name });
}

async function updateNamedResource(
  kind: InventoryNamedResourceKind,
  wsId: string,
  id: string,
  values: InventoryNamedResourceFormValues
) {
  if (kind === 'categories') {
    return updateInventoryProductCategory(wsId, id, { name: values.name });
  }
  if (kind === 'manufacturers') {
    return updateInventoryManufacturer(wsId, id, { name: values.name });
  }
  return updateInventoryUnit(wsId, id, { name: values.name });
}

export function InventoryNamedResourceForm({
  canCreateInventory = false,
  canUpdateInventory = false,
  data,
  kind,
  onFinish,
  wsId,
}: InventoryNamedResourceFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const config = resourceFormConfigs[kind];

  const form = useForm({
    defaultValues: {
      id: data?.id,
      name: data?.name || '',
    },
    resolver: zodResolver(formSchema),
  });

  async function invalidateResourceQueries() {
    await Promise.all(
      config.queryKeys.map((queryKey) =>
        queryClient.invalidateQueries({
          queryKey:
            queryKey === 'inventory-table'
              ? [queryKey, kind, wsId]
              : [queryKey, wsId],
        })
      )
    );
  }

  async function onSubmit(values: InventoryNamedResourceFormValues) {
    if (!values.id && !canCreateInventory) {
      toast.error(t(config.accessDeniedKey));
      return;
    }

    if (values.id && !canUpdateInventory) {
      toast.error(t(config.accessDeniedKey));
      return;
    }

    setLoading(true);

    try {
      if (values.id) {
        await updateNamedResource(kind, wsId, values.id, values);
      } else {
        await createNamedResource(kind, wsId, values);
      }

      await invalidateResourceQueries();
      onFinish?.(values);
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t(values.id ? config.updateErrorKey : config.createErrorKey)
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
              <FormLabel>{t(config.labelKey)}</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  placeholder={t(config.placeholderKey)}
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
              ? t(
                  kind === 'categories'
                    ? 'ws-transaction-categories.edit'
                    : 'common.edit'
                )
              : t(config.createKey)}
        </Button>
      </form>
    </Form>
  );
}
