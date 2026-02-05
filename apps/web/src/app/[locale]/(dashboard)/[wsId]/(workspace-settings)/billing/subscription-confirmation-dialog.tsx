'use client';

import { AlertCircle, CheckCircle, Loader2, X } from '@tuturuuu/icons';
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
import { useState } from 'react';
import type { Plan } from './billing-client';

interface SubscriptionConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: Plan;
  onConfirm: (subscriptionId: string) => Promise<void>;
}

export function SubscriptionConfirmationDialog({
  open,
  onOpenChange,
  currentPlan,
  onConfirm,
}: SubscriptionConfirmationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!currentPlan.id) {
      setError('Invalid plan ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onConfirm(currentPlan.id);
      onOpenChange(false);
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
      onOpenChange(false);
    }
  };

  const isCancelAction = !currentPlan.cancelAtPeriodEnd;

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-md">
        {/* Header with Icon */}
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                isCancelAction ? 'bg-dynamic-red/10' : 'bg-dynamic-green/10'
              }`}
            >
              {isCancelAction ? (
                <X className="h-6 w-6 text-dynamic-red" />
              ) : (
                <CheckCircle className="h-6 w-6 text-dynamic-green" />
              )}
            </div>
            <div className="flex-1">
              <DialogTitle className="font-bold text-xl">
                {isCancelAction
                  ? 'Cancel Subscription'
                  : 'Reactivate Subscription'}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isCancelAction
                  ? 'Are you sure you want to cancel your subscription?'
                  : 'Reactivate your subscription to continue enjoying premium features.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* Information Section */}
        <div className="space-y-4">
          {/* Plan Info */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="mb-2 font-medium text-muted-foreground text-sm">
              Current Plan
            </p>
            <p className="font-semibold text-lg">{currentPlan.name}</p>
          </div>

          {/* What Happens Next */}
          <div
            className={`rounded-lg border-2 p-4 ${
              isCancelAction
                ? 'border-dynamic-orange/50 bg-dynamic-orange/10 dark:bg-dynamic-orange/20'
                : 'border-dynamic-green/50 bg-dynamic-green/10 dark:bg-dynamic-green/20'
            }`}
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertCircle
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  isCancelAction ? 'text-dynamic-orange' : 'text-dynamic-green'
                }`}
              />
              <div className="flex-1">
                <p
                  className={`mb-2 font-semibold text-sm ${
                    isCancelAction
                      ? 'text-dynamic-orange'
                      : 'text-dynamic-green'
                  }`}
                >
                  What happens next?
                </p>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  {isCancelAction ? (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-orange" />
                        <span>
                          Your subscription will remain active until{' '}
                          <span className="font-semibold text-foreground">
                            {currentPlan.nextBillingDate}
                          </span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-orange" />
                        <span>
                          You'll continue to have access to all premium features
                          until then
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-orange" />
                        <span>
                          After {currentPlan.nextBillingDate}, your subscription
                          will end and you'll be moved to the free plan
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-orange" />
                        <span>
                          No charges will be made after the cancellation date
                        </span>
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-green" />
                        <span>
                          Your subscription will be reactivated immediately
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-green" />
                        <span>
                          You'll continue to have access to all premium features
                          without interruption
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-green" />
                        <span>
                          Your next billing date will be{' '}
                          <span className="font-semibold text-foreground">
                            {currentPlan.nextBillingDate}
                          </span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-green" />
                        <span>Regular billing will resume automatically</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
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
            Quit
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`text-background hover:text-background/90 ${
              isCancelAction
                ? 'bg-dynamic-red hover:bg-dynamic-red/90'
                : 'bg-dynamic-green hover:bg-dynamic-green/90'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : isCancelAction ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Cancel Subscription
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Reactivate Subscription
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
