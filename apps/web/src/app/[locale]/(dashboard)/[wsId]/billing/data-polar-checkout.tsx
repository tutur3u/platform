'use client';

import { PolarEmbedCheckout } from '@polar-sh/checkout/embed';
import { type PropsWithChildren, useEffect } from 'react';

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
  customerEmail,
  theme = 'auto',
  className,
  children,
}: PropsWithChildren<PurchaseLinkProps>) => {
  // useEffect(() => {
  //   PolarEmbedCheckout.init();
  // }, []);

  // ✅ UPDATED: Create the URL with the new dynamic path
  const checkoutUrl = `/api/${wsId}/${productId}/payment?productId=${productId}&customerEmail=t@test.com`;

  // You can still add other details as search parameters if you need them
  // if (customerEmail) {
  //   checkoutUrl.searchParams.set('customerEmail', customerEmail);
  // }

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
