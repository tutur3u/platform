'use client';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import type { PropsWithChildren } from 'react';

interface PurchaseLinkProps {
  subscriptionId: string | null;
  productId: string | null;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  /** Number of seats for seat-based products */
  seats?: number;
  /** Called when user wants to change an existing subscription. If provided, opens in-app dialog instead of external portal */
  onPlanChange?: () => void;
}

export default function PurchaseLink({
  subscriptionId,
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
  onPlanChange,
  seats,
}: PropsWithChildren<PurchaseLinkProps>) {
  const mutation = useMutation({
    mutationFn: async () => {
      const url = subscriptionId
        ? `/api/payment/subscriptions/${subscriptionId}/checkouts`
        : `/api/v1/workspaces/${wsId}/billing/checkouts`;

      // Create new checkout session
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wsId,
          productId,
          seats,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const data = await response.json();
      return { type: 'checkout' as const, data };
    },
    onSuccess: (result) => {
      if (result.type === 'checkout' && result.data.url) {
        // Open checkout for new subscriptions
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
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

  return (
    <Button
      onClick={handleClick}
      data-polar-checkout
      data-polar-checkout-theme={theme}
      className={className}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Proceeding...' : children}
    </Button>
  );
}
