'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
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
import { ProductCategoryForm } from './form';

interface Props {
  row: Row<ProductCategory>;
  canUpdateInventory?: boolean;
  canDeleteInventory?: boolean;
}

export function ProductCategoryRowActions({
  row,
  canUpdateInventory = true,
  canDeleteInventory = true,
}: Props) {
  const t = useTranslations();

  const router = useRouter();
  const data = row.original;

  const deleteData = async () => {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_categories_access_denied_description'));
      return;
    }

    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/product-categories/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast(data.message || t('common.error'));
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

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
        title={t('ws-product-categories.edit')}
        editDescription={t('ws-product-categories.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <ProductCategoryForm
            wsId={data.ws_id}
            data={data}
            canUpdateInventory={canUpdateInventory}
          />
        }
      />
    </div>
  );
}
