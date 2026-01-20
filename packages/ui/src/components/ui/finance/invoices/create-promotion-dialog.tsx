'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { PromotionForm } from '@tuturuuu/ui/finance/invoices/promotion-form';
import { useTranslations } from 'next-intl';
import type { FormSchema } from '@tuturuuu/ui/finance/invoices/promotion-form';
import {z} from 'zod';

export type CreatedPromotion = {
  id: string;
  name: string | null;
  code: string | null;
  value: number;
  use_ratio: boolean;
  max_uses: number | null;
  current_uses: number;
};

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
  onSuccess?: (promotion: CreatedPromotion) => void;
  canCreateInventory?: boolean;
}) {
  const t = useTranslations();

  const handleFinish = (
    formData: z.infer<typeof FormSchema>,
    promotion?: CreatedPromotion
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

