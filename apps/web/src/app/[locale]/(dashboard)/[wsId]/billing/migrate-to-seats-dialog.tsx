'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CreditCard, Loader2, Users } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
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
import { useTranslations } from 'next-intl';
import { centToDollar } from '@/utils/price-helper';

interface MigrateToSeatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wsId: string;
}

interface MigrationPreview {
  canMigrate: boolean;
  reason?: string;
  message?: string;
  preview?: {
    currentPlan: {
      name: string;
      tier: string;
      price: number;
      pricingModel: string;
    };
    newPlan: {
      name: string;
      tier: string;
      pricePerSeat: number;
      pricingModel: string;
    };
    memberCount: number;
    initialSeats: number;
    estimatedMonthlyPrice: number;
    billingCycle: string;
  };
}

export function MigrateToSeatsDialog({
  open,
  onOpenChange,
  wsId,
}: MigrateToSeatsDialogProps) {
  const t = useTranslations('billing');

  // Fetch migration preview
  const { data: previewData, isLoading } = useQuery<MigrationPreview>({
    queryKey: ['migration-preview', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/payment/migrate-to-seats?wsId=${wsId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch migration preview');
      }
      return res.json();
    },
    enabled: open,
  });

  // Mutation to initiate migration
  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payment/migrate-to-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate migration');
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Redirect to Polar checkout
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error) => {
      toast.error(t('migration-failed'), {
        description:
          error instanceof Error ? error.message : t('migration-error'),
      });
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Cannot migrate
  if (!previewData?.canMigrate) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('migration-unavailable')}</DialogTitle>
            <DialogDescription>
              {previewData?.message || t('migration-unavailable-description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const { preview } = previewData;
  if (!preview) return null;

  const priceDifference =
    preview.estimatedMonthlyPrice - preview.currentPlan.price;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('switch-to-seat-based')}</DialogTitle>
          <DialogDescription>
            {t('switch-to-seat-based-description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current vs New comparison */}
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-4">
            {/* Current Plan */}
            <div className="rounded-lg border p-3 text-center">
              <p className="mb-1 text-muted-foreground text-xs">
                {t('current-plan')}
              </p>
              <p className="font-semibold">{preview.currentPlan.name}</p>
              <p className="font-bold text-lg">
                ${centToDollar(preview.currentPlan.price)}/
                {preview.billingCycle === 'month' ? t('mo') : t('yr')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('fixed-price')}
              </p>
            </div>

            <ArrowRight className="h-5 w-5 text-muted-foreground" />

            {/* New Plan */}
            <div className="rounded-lg border border-primary bg-primary/5 p-3 text-center">
              <p className="mb-1 text-muted-foreground text-xs">
                {t('new-plan')}
              </p>
              <p className="font-semibold">{preview.newPlan.name}</p>
              <p className="font-bold text-lg">
                ${centToDollar(preview.estimatedMonthlyPrice)}/
                {preview.billingCycle === 'month' ? t('mo') : t('yr')}
              </p>
              <p className="text-muted-foreground text-xs">
                {preview.initialSeats} {t('seats')} × $
                {centToDollar(preview.newPlan.pricePerSeat)}
              </p>
            </div>
          </div>

          {/* Member count info */}
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <Users className="h-4 w-4" />
            <span>
              {t('members-retain-access', {
                count: preview.memberCount,
              })}
            </span>
          </div>

          {/* Price difference alert */}
          {priceDifference !== 0 && (
            <Alert
              variant={priceDifference > 0 ? 'default' : 'default'}
              className="border-dynamic-blue/50 bg-dynamic-blue/5"
            >
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                {priceDifference > 0 ? (
                  <span>
                    {t('price-increase-note', {
                      amount: `$${centToDollar(Math.abs(priceDifference))}`,
                    })}
                  </span>
                ) : (
                  <span>
                    {t('price-decrease-note', {
                      amount: `$${centToDollar(Math.abs(priceDifference))}`,
                    })}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Benefits */}
          <div className="text-muted-foreground text-sm">
            <p className="mb-2 font-medium text-foreground">
              {t('what-changes')}
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>{t('pay-per-member')}</li>
              <li>{t('add-seats-anytime')}</li>
              <li>{t('seat-limits-enforced')}</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={migrateMutation.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}
          >
            {migrateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('processing')}
              </>
            ) : (
              t('proceed-to-checkout')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
