'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
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
import { PromotionForm } from './form';

interface PromotionRowActionsProps {
  row: Row<ProductPromotion>;
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
}

export function PromotionRowActions({
  row,
  canDeleteInventory,
  canUpdateInventory,
}: PromotionRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const promotion = row.original;

  const deletePromotion = async () => {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_promotions_access_denied_description'));
      return;
    }

    const res = await fetch(
      `/api/v1/workspaces/${promotion.ws_id}/promotions/${promotion.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(
        data.message || t('ws-inventory-promotions.failed_delete_promotion')
      );
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {promotion.ws_id && canUpdateInventory && (
        <Dialog
          open={open}
          onOpenChange={(open) => {
            setOpen(open);
          }}
        >
          <DialogContent
            className="max-h-[80vh] max-w-lg overflow-y-scroll"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{t('ws-inventory-promotions.update')}</DialogTitle>
            </DialogHeader>

            <PromotionForm wsId={promotion.ws_id} data={promotion} />
          </DialogContent>
        </Dialog>
      )}

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
        {(canUpdateInventory || canDeleteInventory) && (
          <DropdownMenuContent align="end" className="w-[160px]">
            {canUpdateInventory && (
              <DropdownMenuItem onClick={() => setOpen(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
            )}
            {canUpdateInventory && canDeleteInventory && (
              <DropdownMenuSeparator />
            )}
            {canDeleteInventory && (
              <DropdownMenuItem onClick={deletePromotion}>
                {t('common.delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        )}
      </DropdownMenu>
    </div>
  );
}
