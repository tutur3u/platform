'use client';

import { useMutation } from '@tanstack/react-query';
import { PolarEmbedCheckout } from '@tuturuuu/payment/polar/checkout/embed';
import { Button } from '@tuturuuu/ui/button';
import { useTheme } from 'next-themes';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';

interface PurchaseLinkProps {
  subscriptionId: string | null;
  productId: string | null;
  wsId: string;
  customerEmail?: string;
  className?: string;
  onCheckoutOpened?: () => void;
  /** Called when user wants to change an existing subscription. If provided, opens in-app dialog instead of external portal */
  onPlanChange?: () => void;
}

export default function PurchaseLink({
  subscriptionId,
  productId,
  wsId,
  className,
  children,
  onCheckoutOpened,
  onPlanChange,
}: PropsWithChildren<PurchaseLinkProps>) {
  const { resolvedTheme } = useTheme();
  const [checkoutInstance, setCheckoutInstance] =
    useState<PolarEmbedCheckout | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Create new checkout session for new subscriptions
      const response = await fetch(
        `/api/payment/subscriptions/${subscriptionId}/checkouts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wsId,
            productId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      return { type: 'checkout' as const, data };
    },
    onSuccess: async (result) => {
      if (result.type === 'checkout' && result.data.url) {
        // Open checkout for new subscriptions
        const checkout = await PolarEmbedCheckout.create(result.data.url, {
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          onLoaded: () => onCheckoutOpened?.(),
        });

        setCheckoutInstance(checkout);
      }
    },
    onError: (error) => {
      console.error('Error processing request:', error);
    },
  });

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // If onPlanChange is provided and there's an existing subscription,
    // call the callback directly instead of using mutation
    if (onPlanChange) {
      onPlanChange();
      return;
    }
    mutation.mutate();
  };

  // Clean up checkout instance on unmount
  useEffect(() => {
    return () => {
      if (checkoutInstance) {
        setCheckoutInstance(null);
      }
    };
  }, [checkoutInstance]);

  return (
    <Button
      onClick={handleClick}
      className={className}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Proceeding...' : children}
    </Button>
  );
}
