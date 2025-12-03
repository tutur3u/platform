'use client';

import { useMutation } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import type { PropsWithChildren } from 'react';

interface PurchaseLinkProps {
  subscriptionId?: string;
  productId: string;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

export default function PurchaseLink({
  subscriptionId,
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
}: PropsWithChildren<PurchaseLinkProps>) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (subscriptionId) {
        // For existing subscriptions, redirect to Customer Portal
        // where users can see proration and confirm plan changes
        const response = await fetch('/api/payment/customer-sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message ||
              errorData.error ||
              'Failed to get customer portal URL'
          );
        }

        const data = await response.json();
        return { type: 'portal' as const, data };
      } else {
        // Create new checkout session for new subscriptions
        const response = await fetch('/api/payment/checkouts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wsId,
            productId,
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
      if (result.type === 'portal' && result.data.customerPortalUrl) {
        // Open Polar Customer Portal in new tab for plan changes
        // Users can see proration details and confirm the change there
        window.open(
          result.data.customerPortalUrl,
          '_blank',
          'noopener,noreferrer'
        );
      } else if (result.type === 'checkout' && result.data.url) {
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
