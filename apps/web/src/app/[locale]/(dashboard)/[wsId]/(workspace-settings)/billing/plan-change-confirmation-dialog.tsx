'use client';

import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  CheckCircle,
  Loader2,
  Sparkles,
  Users,
  Zap,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import type { ProrationPreview } from '@/app/api/payment/subscriptions/[subscriptionId]/preview/route';
import { centToDollar } from '@/utils/price-helper';

interface PlanChangeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetPlanId: string;
  subscriptionId: string;
  onSuccess?: () => void;
}

export function PlanChangeConfirmationDialog({
  open,
  onOpenChange,
  targetPlanId,
  subscriptionId,
  onSuccess,
}: PlanChangeConfirmationDialogProps) {
  const t = useTranslations('billing');
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProrationPreview | null>(null);

  const isUpgrade = preview ? preview.isUpgrade : false;

  // Fetch proration preview when dialog opens
  const fetchPreview = useCallback(async () => {
    if (!open || !subscriptionId || !targetPlanId) return;

    setIsLoadingPreview(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/payment/subscriptions/${subscriptionId}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: targetPlanId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch proration preview');
      }

      const data = await response.json();
      setPreview(data);
    } catch (err) {
      console.error('Error fetching preview:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to calculate proration'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [open, subscriptionId, targetPlanId]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleConfirm = async () => {
    if (!subscriptionId || !targetPlanId) {
      setError('Invalid subscription or plan');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/payment/subscriptions/${subscriptionId}/change`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: targetPlanId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change plan');
      }

      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      setError(null);
      setPreview(null);
      onOpenChange(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Helper to simplify plan names
  const getSimplePlanName = (name: string): string => {
    return name
      .replace(/^Tuturuuu\s+Workspace\s+/i, '')
      .replace(/^Tuturuuu\s+/i, '')
      .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
      .trim();
  };

  const simplifiedCurrentPlanName = getSimplePlanName(
    preview?.currentPlan.name ?? ''
  );
  const simplifiedTargetPlanName = getSimplePlanName(
    preview?.newPlan.name ?? ''
  );

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-lg">
        {/* Header with Icon */}
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                isUpgrade ? 'bg-dynamic-green/10' : 'bg-dynamic-orange/10'
              )}
            >
              {isUpgrade ? (
                <ArrowUpCircle className="h-6 w-6 text-dynamic-green" />
              ) : (
                <ArrowDownCircle className="h-6 w-6 text-dynamic-orange" />
              )}
            </div>
            <div className="flex-1">
              <DialogTitle className="font-bold text-xl">
                {isUpgrade
                  ? t('upgrade-to', { plan: simplifiedTargetPlanName })
                  : t('downgrade-to', { plan: simplifiedTargetPlanName })}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t('confirm-plan-change-description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="space-y-4">
          {/* Plan Comparison Cards */}
          <div className="flex items-center gap-3">
            {/* Current Plan */}
            <div className="flex-1 rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-muted-foreground text-xs">
                  {t('current')}
                </span>
              </div>
              <p className="font-semibold">{simplifiedCurrentPlanName}</p>
              {preview?.currentPlan.pricingModel === 'seat_based' &&
              preview.currentPlan.seatCount ? (
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">
                    ${centToDollar(preview.currentPlan.pricePerSeat ?? 0)}/seat
                    × {preview.currentPlan.seatCount} seats
                  </p>
                  <p className="text-muted-foreground text-sm">
                    ${centToDollar(preview?.currentPlan.price ?? 0)}/
                    {preview?.currentPlan.billingCycle === 'month'
                      ? t('mo')
                      : t('yr')}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  ${centToDollar(preview?.currentPlan.price ?? 0)}/
                  {preview?.currentPlan.billingCycle === 'month'
                    ? t('mo')
                    : t('yr')}
                </p>
              )}
            </div>

            {/* Arrow */}
            <div className="shrink-0">
              <ArrowRight
                className={cn(
                  'h-5 w-5',
                  isUpgrade ? 'text-dynamic-green' : 'text-dynamic-orange'
                )}
              />
            </div>

            {/* Target Plan */}
            <div
              className={cn(
                'flex-1 rounded-lg border-2 p-3',
                isUpgrade
                  ? 'border-dynamic-green/50 bg-dynamic-green/5'
                  : 'border-dynamic-orange/50 bg-dynamic-orange/5'
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <Sparkles
                  className={cn(
                    'h-4 w-4',
                    isUpgrade ? 'text-dynamic-green' : 'text-dynamic-orange'
                  )}
                />
                <span
                  className={cn(
                    'font-medium text-xs',
                    isUpgrade ? 'text-dynamic-green' : 'text-dynamic-orange'
                  )}
                >
                  {t('new')}
                </span>
              </div>
              <p className="font-semibold">{simplifiedTargetPlanName}</p>
              {preview?.newPlan.pricingModel === 'seat_based' &&
              preview.newPlan.seatCount ? (
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">
                    ${centToDollar(preview.newPlan.pricePerSeat ?? 0)}/seat ×{' '}
                    {preview.newPlan.seatCount} seats
                  </p>
                  <p className="text-muted-foreground text-sm">
                    ${centToDollar(preview?.newPlan.price ?? 0)}/
                    {preview?.newPlan.billingCycle === 'month'
                      ? t('mo')
                      : t('yr')}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  ${centToDollar(preview?.newPlan.price ?? 0)}/
                  {preview?.newPlan.billingCycle === 'month'
                    ? t('mo')
                    : t('yr')}
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Proration Summary */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
            <h4 className="mb-3 font-semibold text-sm">
              {t('proration-summary')}
            </h4>

            {isLoadingPreview ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
              </div>
            ) : preview ? (
              <div className="space-y-2 text-sm">
                {/* Seat count info for seat-based plans */}
                {(preview.currentPlan.pricingModel === 'seat_based' ||
                  preview.newPlan.pricingModel === 'seat_based') && (
                  <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {t('current-seats')}
                    </span>
                    <span className="font-medium">
                      {preview.currentPlan.seatCount ||
                        preview.newPlan.seatCount ||
                        1}
                    </span>
                  </div>
                )}

                {/* Credit for unused current plan */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {t('credit-for-unused', {
                      plan: simplifiedCurrentPlanName,
                    })}{' '}
                    ({preview.daysRemaining} {t('days')})
                    {preview.currentPlan.pricingModel === 'seat_based' &&
                      preview.currentPlan.seatCount && (
                        <span className="block text-xs">
                          ($
                          {centToDollar(preview.currentPlan.pricePerSeat ?? 0)}
                          /seat × {preview.currentPlan.seatCount})
                        </span>
                      )}
                  </span>
                  <span className="font-medium text-dynamic-green">
                    -${centToDollar(preview.currentPlan.remainingValue)}
                  </span>
                </div>

                {/* Charge for new plan */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {simplifiedTargetPlanName} {t('charge')}
                    {preview.billingCycleChanged ? (
                      <span>
                        {' '}
                        ({t('full')}{' '}
                        {preview.newPlan.billingCycle === 'year'
                          ? t('yr')
                          : t('mo')}
                        )
                      </span>
                    ) : (
                      <span>
                        {' '}
                        ({preview.daysRemaining} {t('days')})
                      </span>
                    )}
                    {preview.newPlan.pricingModel === 'seat_based' &&
                      preview.newPlan.seatCount && (
                        <span className="block text-xs">
                          (${centToDollar(preview.newPlan.pricePerSeat ?? 0)}
                          /seat × {preview.newPlan.seatCount})
                        </span>
                      )}
                  </span>
                  <span className="font-medium">
                    +${centToDollar(preview.newPlan.proratedCharge)}
                  </span>
                </div>

                <Separator className="my-2" />

                {/* Net amount */}
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {preview.netAmount >= 0
                      ? t('amount-due-today')
                      : t('credit-applied')}
                  </span>
                  <span
                    className={cn(
                      'text-lg',
                      preview.netAmount >= 0
                        ? 'text-foreground'
                        : 'text-dynamic-green'
                    )}
                  >
                    {preview.netAmount >= 0 ? '' : '-'}$
                    {centToDollar(Math.abs(preview.netAmount))}
                  </span>
                </div>
              </div>
            ) : error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
          </div>

          {/* What Happens Next */}
          <div
            className={cn(
              'rounded-lg border-2 p-4',
              isUpgrade
                ? 'border-dynamic-green/30 bg-dynamic-green/5'
                : 'border-dynamic-orange/30 bg-dynamic-orange/5'
            )}
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertCircle
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  isUpgrade ? 'text-dynamic-green' : 'text-dynamic-orange'
                )}
              />
              <div className="flex-1">
                <p
                  className={cn(
                    'mb-2 font-semibold text-sm',
                    isUpgrade ? 'text-dynamic-green' : 'text-dynamic-orange'
                  )}
                >
                  {t('what-happens-next')}
                </p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                        isUpgrade ? 'bg-dynamic-green' : 'bg-dynamic-orange'
                      )}
                    />
                    <span>{t('plan-changes-immediately')}</span>
                  </li>
                  {preview && (
                    <>
                      <li className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                            isUpgrade ? 'bg-dynamic-green' : 'bg-dynamic-orange'
                          )}
                        />
                        <span>
                          {preview.netAmount >= 0
                            ? t('charged-now', {
                                amount: `$${centToDollar(preview.netAmount)}`,
                              })
                            : t('credited-now', {
                                amount: `$${centToDollar(Math.abs(preview.netAmount))}`,
                              })}
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                            isUpgrade ? 'bg-dynamic-green' : 'bg-dynamic-orange'
                          )}
                        />
                        <span>
                          {t('next-billing-info', {
                            date: formatDate(preview.nextBillingDate),
                            amount: `$${centToDollar(preview?.newPlan.price ?? 0)}`,
                          })}
                        </span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && !isLoadingPreview && (
            <div className="flex items-start gap-3 rounded-lg border-2 border-dynamic-red/50 bg-dynamic-red/10 p-4 dark:bg-dynamic-red/20">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-dynamic-red" />
              <p className="text-dynamic-red text-sm">{error}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Footer Actions */}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || isLoadingPreview || !!error}
            className={cn(
              'text-background hover:text-background/90',
              isUpgrade
                ? 'bg-dynamic-green hover:bg-dynamic-green/90'
                : 'bg-dynamic-orange hover:bg-dynamic-orange/90'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('processing')}
              </>
            ) : isUpgrade ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('confirm-upgrade')}
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('confirm-downgrade')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
