'use client';

import { PromotionForm } from './form';
import { Row } from '@tanstack/react-table';
import { ProductPromotion } from '@tutur3u/types/primitives/ProductPromotion';
import { Button } from '@tutur3u/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tutur3u/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PromotionRowActionsProps {
  row: Row<ProductPromotion>;
}

export function PromotionRowActions({ row }: PromotionRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);

  const promotion = row.original;

  const deletePromotion = async () => {
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
      toast({
        // TODO: i18n
        title: 'Failed to delete workspace promotion',
        description: data.message,
      });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {promotion.ws_id && (
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
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            {t('common.edit')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deletePromotion}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
