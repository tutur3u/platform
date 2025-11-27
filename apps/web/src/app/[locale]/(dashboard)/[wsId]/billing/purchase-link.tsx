'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import type { PropsWithChildren } from 'react';

interface PurchaseLinkProps {
  subscriptionId?: string;
  productId: string;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  sandbox?: boolean;
}

export default function PurchaseLink({
  subscriptionId,
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
  sandbox = false,
}: PropsWithChildren<PurchaseLinkProps>) {
  const router = useRouter();

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    try {
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

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Reload the page to reflect the updated subscription
            router.refresh();
          }
        } else {
          const errorData = await response.json();
          console.error(
            'Failed to update subscription:',
            errorData.message || errorData.error
          );
        }
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

        if (response.ok) {
          const data = await response.json();
          if (data.url) {
            window.open(data.url, '_blank', 'noopener,noreferrer');
          }
        } else {
          console.error('Failed to create checkout session');
        }
      }
    } catch (error) {
      console.error('Error processing request:', error);
    }
  };

  return (
    <Button
      onClick={handleClick}
      data-polar-checkout
      data-polar-checkout-theme={theme}
      className={className}
    >
      {children}
    </Button>
  );
}
