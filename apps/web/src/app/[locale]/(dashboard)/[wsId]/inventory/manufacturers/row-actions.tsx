'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import {
  deleteInventoryManufacturer,
  type InventoryManufacturer,
} from '@tuturuuu/internal-api';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProductManufacturerForm } from './form';

interface Props {
  row: Row<InventoryManufacturer>;
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
}

export function ProductManufacturerRowActions({
  row,
  canDeleteInventory = false,
  canUpdateInventory = false,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const data = row.original;
  const [showEditDialog, setShowEditDialog] = useState(false);

  const deleteData = async () => {
    if (!canDeleteInventory) {
      toast.error(
        t('ws-roles.inventory_manufacturers_access_denied_description')
      );
      return;
    }

    try {
      await deleteInventoryManufacturer(data.ws_id, data.id);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['inventory-table', 'manufacturers', data.ws_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['inventory-product-form-options', data.ws_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['product-manufacturers', data.ws_id],
        }),
      ]);
      router.refresh();
    } catch {
      toast.error(t('ws-inventory-manufacturers.failed_delete_manufacturer'));
    }
  };

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          {canUpdateInventory && (
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              {t('common.edit')}
            </DropdownMenuItem>
          )}
          {canUpdateInventory && canDeleteInventory && (
            <DropdownMenuSeparator />
          )}
          {canDeleteInventory && (
            <DropdownMenuItem onClick={deleteData}>
              {t('common.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-inventory-manufacturers.edit')}
        editDescription={t('ws-inventory-manufacturers.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <ProductManufacturerForm
            wsId={data.ws_id}
            data={data}
            canUpdateInventory={canUpdateInventory}
          />
        }
      />
    </div>
  );
}
