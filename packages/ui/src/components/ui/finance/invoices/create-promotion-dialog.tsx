'use client';

import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { FormSchema } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { PromotionForm } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';

export function CreatePromotionDialog({
  wsId,
  open,
  onOpenChange,
  onSuccess,
  canCreateInventory = true,
}: {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (promotion: ProductPromotion) => void;
  canCreateInventory?: boolean;
}) {
  const t = useTranslations();

  const handleFinish = (
    _formData: z.infer<typeof FormSchema>,
    promotion?: ProductPromotion
  ) => {
    // Close the dialog on successful submission
    onOpenChange(false);
    // Call onSuccess with the created promotion if provided
    if (promotion) {
      onSuccess?.(promotion);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('ws-invoices.create_promotion')}</DialogTitle>
          <DialogDescription>
            {t('ws-inventory-promotions.create_description')}
          </DialogDescription>
        </DialogHeader>

        <PromotionForm
          wsId={wsId}
          onFinish={handleFinish}
          onCancel={handleCancel}
          showCancelButton={true}
          canCreateInventory={canCreateInventory}
        />
      </DialogContent>
    </Dialog>
  );
}
