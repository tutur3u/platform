'use client';

import type { PropsWithChildren } from 'react';

interface PurchaseLinkProps {
  productId: string;
  wsId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

const PurchaseLink = ({
  productId,
  wsId,
  theme = 'auto',
  className,
  children,
}: PropsWithChildren<PurchaseLinkProps>) => {
  const checkoutUrl = `/api/${wsId}/${productId}/payment`;

  return (
    <a
      href={checkoutUrl.toString()}
      data-polar-checkout
      data-polar-checkout-theme={theme}
      className={className}
    >
      {children}
    </a>
  );
};

export default PurchaseLink;
