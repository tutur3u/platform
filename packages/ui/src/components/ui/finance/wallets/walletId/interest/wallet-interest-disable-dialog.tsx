'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

interface WalletInterestDisableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * Confirmation dialog for disabling interest tracking.
 * Warns user that calculations will stop (but rate history is preserved).
 */
export function WalletInterestDisableDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: WalletInterestDisableDialogProps) {
  const t = useTranslations('wallet-interest');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('disable_tracking')}</DialogTitle>
          <DialogDescription>{t('disable_confirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? t('disabling') : t('disable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
