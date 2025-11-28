'use client';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { PlanChangeConfirmationDialog } from './plan-change-confirmation-dialog';

interface PlanDetails {
  id: string;
  name: string;
  price: number;
  billingCycle: string | null;
  features: string[];
}

interface PurchaseLinkProps {
  subscriptionId?: string;
  productId: string;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  sandbox?: boolean;
  currentPlanDetails?: PlanDetails;
  newPlanDetails?: PlanDetails;
  nextBillingDate?: string;
  isUpgrade?: boolean;
}

export default function PurchaseLink({
  subscriptionId,
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
  sandbox = false,
  currentPlanDetails,
  newPlanDetails,
  nextBillingDate,
  isUpgrade = true,
}: PropsWithChildren<PurchaseLinkProps>) {
  const router = useRouter();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [planDetails, setPlanDetails] = useState<{
    current: PlanDetails;
    new: PlanDetails;
  } | null>(null);

  useEffect(() => {
    if (currentPlanDetails && newPlanDetails) {
      setPlanDetails({
        current: currentPlanDetails,
        new: newPlanDetails,
      });
    }
  }, [currentPlanDetails, newPlanDetails]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (subscriptionId) {
        // Update existing subscription with new product
        const response = await fetch(
          `/api/payment/customer-portal/subscriptions/${subscriptionId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              productId,
              sandbox,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message ||
              errorData.error ||
              'Failed to update subscription'
          );
        }

        const data = await response.json();
        return { type: 'update' as const, data };
      } else {
        // Create new checkout session
        const response = await fetch('/api/payment/checkouts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wsId,
            productId,
            sandbox,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create checkout session');
        }

        const data = await response.json();
        return { type: 'checkout' as const, data };
      }
    },
    onSuccess: (result) => {
      if (result.type === 'update' && result.data.success) {
        // Reload the page to reflect the updated subscription
        router.refresh();
      } else if (result.type === 'checkout' && result.data.url) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      }
    },
    onError: (error) => {
      console.error('Error processing request:', error);
    },
  });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // If plan change (has subscriptionId and planDetails), show confirmation dialog
    if (subscriptionId && planDetails) {
      setShowConfirmDialog(true);
    } else {
      // Direct checkout for new subscriptions
      mutation.mutate();
    }
  };

  const handleConfirm = () => {
    setShowConfirmDialog(false);
    mutation.mutate();
  };

  return (
    <>
      <Button
        onClick={handleClick}
        data-polar-checkout
        data-polar-checkout-theme={theme}
        className={className}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Proceeding...' : children}
      </Button>

      {planDetails && (
        <PlanChangeConfirmationDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          currentPlan={planDetails.current}
          newPlan={planDetails.new}
          isUpgrade={isUpgrade}
          nextBillingDate={nextBillingDate ?? ''}
          onConfirm={handleConfirm}
          isLoading={mutation.isPending}
        />
      )}
    </>
  );
}
