'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis } from '@tuturuuu/icons';
import {
  deleteInventoryManufacturer,
  deleteInventoryProductCategory,
  deleteInventoryUnit,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useRouter } from '../../lib/platform/next-navigation-shim';
import {
  InventoryNamedResourceForm,
  type InventoryNamedResourceKind,
  type InventoryNamedResourceRow,
} from './inventory-named-resource-form';

type InventoryNamedResourceRowActionsProps = {
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
  data: InventoryNamedResourceRow;
  kind: InventoryNamedResourceKind;
};

type ResourceActionConfig = {
  accessDeniedKey: string;
  deleteErrorKey: string;
  editDescriptionKey: string;
  editTitleKey: string;
  queryKeys: string[];
};

const resourceActionConfigs = {
  categories: {
    accessDeniedKey: 'ws-roles.inventory_categories_access_denied_description',
    deleteErrorKey: 'common.error',
    editDescriptionKey: 'ws-product-categories.edit_description',
    editTitleKey: 'ws-product-categories.edit',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-categories',
    ],
  },
  manufacturers: {
    accessDeniedKey:
      'ws-roles.inventory_manufacturers_access_denied_description',
    deleteErrorKey: 'ws-inventory-manufacturers.failed_delete_manufacturer',
    editDescriptionKey: 'ws-inventory-manufacturers.edit_description',
    editTitleKey: 'ws-inventory-manufacturers.edit',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-manufacturers',
    ],
  },
  units: {
    accessDeniedKey: 'ws-roles.inventory_units_access_denied_description',
    deleteErrorKey: 'ws-inventory-units.failed_delete_unit',
    editDescriptionKey: 'ws-product-units.edit_description',
    editTitleKey: 'ws-product-units.edit',
    queryKeys: [
      'inventory-table',
      'inventory-product-form-options',
      'product-units',
    ],
  },
} satisfies Record<InventoryNamedResourceKind, ResourceActionConfig>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function deleteNamedResource(
  kind: InventoryNamedResourceKind,
  wsId: string,
  id: string
) {
  if (kind === 'categories') {
    return deleteInventoryProductCategory(wsId, id);
  }
  if (kind === 'manufacturers') {
    return deleteInventoryManufacturer(wsId, id);
  }
  return deleteInventoryUnit(wsId, id);
}

export function InventoryNamedResourceRowActions({
  canDeleteInventory = false,
  canUpdateInventory = false,
  data,
  kind,
}: InventoryNamedResourceRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const config = resourceActionConfigs[kind];

  const deleteData = async () => {
    if (!canDeleteInventory) {
      toast.error(t(config.accessDeniedKey));
      return;
    }

    if (!data.id || !data.ws_id) {
      return;
    }

    try {
      await deleteNamedResource(kind, data.ws_id, data.id);
      await Promise.all(
        config.queryKeys.map((queryKey) =>
          queryClient.invalidateQueries({
            queryKey:
              queryKey === 'inventory-table'
                ? [queryKey, kind, data.ws_id]
                : [queryKey, data.ws_id],
          })
        )
      );
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t(config.deleteErrorKey)));
    }
  };

  if (!data.id || !data.ws_id) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            variant="ghost"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {canUpdateInventory ? (
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              {t('common.edit')}
            </DropdownMenuItem>
          ) : null}
          {canUpdateInventory && canDeleteInventory ? (
            <DropdownMenuSeparator />
          ) : null}
          {canDeleteInventory ? (
            <DropdownMenuItem
              onClick={() => {
                void deleteData();
              }}
            >
              {t('common.delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        editDescription={t(config.editDescriptionKey)}
        form={
          <InventoryNamedResourceForm
            canUpdateInventory={canUpdateInventory}
            data={data}
            kind={kind}
            wsId={data.ws_id}
          />
        }
        open={showEditDialog}
        setOpen={setShowEditDialog}
        title={t(config.editTitleKey)}
      />
    </div>
  );
}
