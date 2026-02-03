'use client';

import { useMutation } from '@tanstack/react-query';
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

interface AdjustSeatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
  currentSeats: number;
  currentMembers: number;
  maxSeats?: number | null;
  pricePerSeat: number;
  billingCycle: string | null;
}

export function AdjustSeatsDialog({
  open,
  onOpenChange,
  wsId,
  currentSeats,
  currentMembers,
  maxSeats,
  pricePerSeat,
  billingCycle,
}: AdjustSeatsDialogProps) {
  const [newSeatCount, setNewSeatCount] = useState(currentSeats);
  const t = useTranslations('billing');
  const router = useRouter();

  const seatDifference = newSeatCount - currentSeats;
  const totalCost = pricePerSeat * newSeatCount;
  const currentCost = pricePerSeat * currentSeats;
  const costDifference = totalCost - currentCost;

  // Minimum is at least current members, maximum is maxSeats or unlimited
  const minSeats = Math.max(1, currentMembers);
  const effectiveMaxSeats = maxSeats ?? Infinity;

  const mutation = useMutation({
    mutationFn: async ({
      wsId,
      newSeatCount,
    }: {
      wsId: string;
      newSeatCount: number;
    }) => {
      const response = await fetch('/api/payment/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wsId,
          newSeatCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update seats');
      }

      return data;
    },
    onError: (error, _variables, _context) => {
      console.error('Error updating seats:', error);
      toast.error('Failed to update seats', {
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    },
    onSuccess: (data) => {
      const action =
        seatDifference > 0
          ? 'increased'
          : seatDifference < 0
            ? 'decreased'
            : 'unchanged';
      toast.success('Seats updated successfully', {
        description: `Seat count ${action} to ${data.newSeats} seats.`,
      });

      onOpenChange(false);
      router.refresh();
    },
  });

  const handleUpdateSeats = async (): Promise<void> => {
    if (newSeatCount < minSeats || newSeatCount > effectiveMaxSeats) return;
    if (newSeatCount === currentSeats) {
      onOpenChange(false);
      return;
    }
    await mutation.mutateAsync({ wsId, newSeatCount });
  };

  const incrementSeats = () =>
    setNewSeatCount((prev) => Math.min(effectiveMaxSeats, prev + 1));
  const decrementSeats = () =>
    setNewSeatCount((prev) => Math.max(minSeats, prev - 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('adjust-seats')}
          </DialogTitle>
          <DialogDescription>{t('adjust-seats-description')}</DialogDescription>
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
              <span className="text-muted-foreground">Current Members</span>
              <span className="font-medium">{currentMembers}</span>
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
            {maxSeats && (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Maximum Seats</span>
                <span className="font-medium">{maxSeats}</span>
              </div>
            )}
          </div>

          {/* Seat quantity selector */}
          <div className="space-y-2">
            <label className="font-medium text-sm">New Seat Count</label>
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={decrementSeats}
                disabled={newSeatCount <= minSeats}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min={minSeats}
                max={effectiveMaxSeats}
                value={newSeatCount}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10) || minSeats;
                  setNewSeatCount(
                    Math.max(minSeats, Math.min(effectiveMaxSeats, value))
                  );
                }}
                className="w-24 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={incrementSeats}
                disabled={newSeatCount >= effectiveMaxSeats}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-muted-foreground text-xs">
              Range: {minSeats} - {maxSeats ?? '∞'} seats
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-3 rounded-lg border bg-background p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Seat Change</span>
              <span
                className={`font-medium ${seatDifference > 0 ? 'text-dynamic-green' : seatDifference < 0 ? 'text-dynamic-red' : ''}`}
              >
                {seatDifference > 0 ? '+' : ''}
                {seatDifference}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t('new-total-seats')}
              </span>
              <span className="font-medium">{newSeatCount}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="font-medium">New Cost</span>
                <span className="font-bold text-lg">
                  ${centToDollar(totalCost)}
                  {billingCycle === 'month' ? t('per-month') : t('per-year')}
                </span>
              </div>
              {seatDifference !== 0 && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">Cost Change</span>
                  <span
                    className={`font-medium ${costDifference > 0 ? 'text-dynamic-green' : 'text-dynamic-red'}`}
                  >
                    {costDifference > 0 ? '+' : ''}$
                    {centToDollar(costDifference)}
                  </span>
                </div>
              )}
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
            disabled={mutation.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleUpdateSeats}
            disabled={
              mutation.isPending ||
              newSeatCount === currentSeats ||
              newSeatCount < minSeats ||
              newSeatCount > effectiveMaxSeats
            }
          >
            {mutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Update Seats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
