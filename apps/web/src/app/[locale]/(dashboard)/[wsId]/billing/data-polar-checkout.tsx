'use client';

import { Button } from '@tuturuuu/ui/button';
import type { PropsWithChildren } from 'react';

interface PurchaseLinkProps {
  productId: string;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
  sandbox?: boolean;
}

const PurchaseLink = ({
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
  sandbox = false,
}: PropsWithChildren<PurchaseLinkProps>) => {
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    try {
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
    } catch (error) {
      console.error('Error creating checkout:', error);
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
};

export default PurchaseLink;
