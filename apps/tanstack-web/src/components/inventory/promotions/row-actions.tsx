'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { deleteWorkspacePromotion } from '@tuturuuu/internal-api';
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
import { PromotionForm } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '../../../lib/platform/next-navigation-shim';

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
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);

  const promotion = row.original;

  const deletePromotion = async () => {
    if (!canDeleteInventory) {
      toast.error(t('ws-roles.inventory_promotions_access_denied_description'));
      return;
    }

    if (!promotion.ws_id || !promotion.id) {
      return;
    }

    try {
      await deleteWorkspacePromotion(promotion.ws_id, promotion.id);
      await queryClient.invalidateQueries({
        queryKey: ['inventory-table', 'promotions', promotion.ws_id],
      });
      router.refresh();
    } catch (err) {
      toast.error(
        (err as { message?: string })?.message ||
          t('ws-inventory-promotions.failed_delete_promotion')
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

            <PromotionForm
              wsId={promotion.ws_id}
              data={promotion}
              canUpdateInventory={canUpdateInventory}
              onFinish={() => {
                queryClient.invalidateQueries({
                  queryKey: ['inventory-table', 'promotions', promotion.ws_id],
                });
                setOpen(false);
              }}
            />
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
