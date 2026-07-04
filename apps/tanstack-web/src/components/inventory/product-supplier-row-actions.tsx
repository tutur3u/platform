'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis } from '@tuturuuu/icons';
import { deleteInventorySupplier } from '@tuturuuu/internal-api/inventory';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
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
import { ProductSupplierForm } from './product-supplier-form';

type ProductSupplierRowActionsProps = {
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
  data: ProductSupplier;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProductSupplierRowActions({
  canDeleteInventory,
  canUpdateInventory,
  data,
}: ProductSupplierRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showEditDialog, setShowEditDialog] = useState(false);

  const deleteData = async () => {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_suppliers_access_denied_description'));
      return;
    }

    if (!data.id || !data.ws_id) {
      return;
    }

    try {
      await deleteInventorySupplier(data.ws_id, data.id);
      await queryClient.invalidateQueries({
        queryKey: ['inventory-table', 'suppliers', data.ws_id],
      });
      router.refresh();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t('ws-inventory-suppliers.failed_delete_supplier')
        )
      );
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
        editDescription={t('ws-product-suppliers.edit_description')}
        form={
          <ProductSupplierForm
            canUpdateInventory={canUpdateInventory}
            data={data}
            wsId={data.ws_id}
          />
        }
        open={showEditDialog}
        setOpen={setShowEditDialog}
        title={t('ws-product-suppliers.edit')}
      />
    </div>
  );
}
