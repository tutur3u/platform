'use client';

import { Loader2, Minus, Plus, Users } from '@tuturuuu/icons';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { centToDollar } from '@/utils/price-helper';

interface AddSeatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  currentSeats: number;
  pricePerSeat: number;
  billingCycle: string | null;
}

export function AddSeatsDialog({
  open,
  onOpenChange,
  wsId,
  currentSeats,
  pricePerSeat,
  billingCycle,
}: AddSeatsDialogProps) {
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('billing');
  const router = useRouter();

  const totalCost = pricePerSeat * additionalSeats;
  const newTotalSeats = currentSeats + additionalSeats;

  const handlePurchaseSeats = async () => {
    if (additionalSeats < 1) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/payment/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          additionalSeats,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to purchase seats');
      }

      toast.success(t('seats-purchased-success'), {
        description: t('seats-purchased-description', {
          count: additionalSeats,
          total: data.newSeats,
        }),
      });

      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error('Error purchasing seats:', error);
      toast.error(t('seats-purchased-error'), {
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const incrementSeats = () => setAdditionalSeats((prev) => prev + 1);
  const decrementSeats = () =>
    setAdditionalSeats((prev) => Math.max(1, prev - 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('add-seats')}
          </DialogTitle>
          <DialogDescription>{t('add-seats-description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current seats info */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('current-seats')}
              </span>
              <span className="font-medium">{currentSeats}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('price-per-seat')}
              </span>
              <span className="font-medium">
                ${centToDollar(pricePerSeat)}
                {billingCycle === 'month' ? t('per-month') : t('per-year')}
              </span>
            </div>
          </div>

          {/* Seat quantity selector */}
          <div className="space-y-2">
            <label className="font-medium text-sm">
              {t('additional-seats')}
            </label>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={decrementSeats}
                disabled={additionalSeats <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={1}
                value={additionalSeats}
                onChange={(e) =>
                  setAdditionalSeats(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="w-20 text-center"
              />
              <Button variant="outline" size="icon" onClick={incrementSeats}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('new-total-seats')}
              </span>
              <span className="font-medium">{newTotalSeats}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="font-medium">{t('additional-cost')}</span>
                <span className="font-bold text-lg">
                  ${centToDollar(totalCost)}
                  {billingCycle === 'month' ? t('per-month') : t('per-year')}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('prorated-billing-note')}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handlePurchaseSeats} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('purchase-seats')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
