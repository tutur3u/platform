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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WalletInterestRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateRate: (rate: number) => void;
  isPending: boolean;
  currentRate?: number;
}

/**
 * Dialog for updating the interest rate.
 * Shows current rate and allows entering a new rate.
 */
export function WalletInterestRateDialog({
  open,
  onOpenChange,
  onUpdateRate,
  isPending,
  currentRate = 0,
}: WalletInterestRateDialogProps) {
  const t = useTranslations('wallet-interest');
  const [newRate, setNewRate] = useState<string>(currentRate.toString());

  // Reset rate when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setNewRate(currentRate.toString());
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = () => {
    const rate = parseFloat(newRate);
    if (!Number.isNaN(rate) && rate >= 0 && rate <= 100) {
      onUpdateRate(rate);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('update_rate')}</DialogTitle>
          <DialogDescription>{t('update_rate_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('new_rate')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !newRate}>
            {isPending ? t('updating') : t('update')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
