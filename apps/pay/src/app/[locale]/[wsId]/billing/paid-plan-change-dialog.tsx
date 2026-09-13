'use client';

import { useMutation } from '@tanstack/react-query';
import { changePaySubscriptionPlan } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface PaidPlanSelection {
  id: string;
  name: string;
  seats: number;
  amount: number;
  cycle: string | null;
}

export function PaidPlanChangeDialog({
  subscriptionId,
  plan,
  onClose,
  onChanged,
  onSyncPending,
}: {
  subscriptionId: string;
  plan: PaidPlanSelection | null;
  onClose: () => void;
  onChanged: () => void;
  onSyncPending: () => void;
}) {
  const t = useTranslations('billing');
  const router = useRouter();
  const [syncPending, setSyncPending] = useState(false);
  const mutation = useMutation({
    mutationFn: (selection: PaidPlanSelection) =>
      changePaySubscriptionPlan(subscriptionId, selection.id, {
        expectedSeats: selection.seats,
        expectedPricePerSeat: selection.amount / selection.seats,
      }),
    onSuccess: (data) => {
      if (data.syncPending) {
        setSyncPending(true);
        onSyncPending();
        return;
      }
      onClose();
      onChanged();
      router.refresh();
    },
    onError: (error) =>
      toast.error(t('plan-update-failed'), { description: error.message }),
  });
  return (
    <Dialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirm-paid-plan-change')}</DialogTitle>
          <DialogDescription>{t('paid-plan-charge-note')}</DialogDescription>
        </DialogHeader>
        {plan && (
          <div className="space-y-2">
            <p className="font-medium">{plan.name}</p>
            <p>
              {t('estimated-total', {
                total: (plan.amount / 100).toFixed(2),
                cycle: plan.cycle === 'year' ? t('per-year') : t('per-month'),
                count: plan.seats,
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('catalog-rate-description')}
            </p>
          </div>
        )}
        {syncPending && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('plan-sync-pending')}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={mutation.isPending || syncPending || !plan}
            onClick={() => {
              if (plan) mutation.mutate(plan);
            }}
          >
            {t('confirm-paid-plan-change')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
