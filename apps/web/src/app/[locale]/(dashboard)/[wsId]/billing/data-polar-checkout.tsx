'use client';

import { PolarEmbedCheckout } from '@polar-sh/checkout/embed';
import { type PropsWithChildren, useEffect } from 'react';

// Define the props for type safety and clarity
interface PurchaseLinkProps {
  productId: string;
  customerEmail?: string;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
}

// Use PropsWithChildren to correctly type the 'children' prop
const PurchaseLink = ({
  productId,
  customerEmail,
  theme = 'auto', // Default theme
  className,
  children,
}: PropsWithChildren<PurchaseLinkProps>) => {
  // Initialize the Polar embed script once when the component mounts.
  // This is correct!
  useEffect(() => {
    PolarEmbedCheckout.init();
  }, []);

  // 1. Dynamically create the checkout URL based on the component's props.
  //    This was the missing piece. We use `window.location.origin` to ensure the URL
  //    is always absolute (e.g., http://localhost:3000 or https://your-site.com).
  const checkoutUrl = new URL('/checkout', window.location.origin);
  checkoutUrl.searchParams.set('productId', productId);

  if (customerEmail) {
    checkoutUrl.searchParams.set('customerEmail', customerEmail);
  }

  // 2. Render the anchor tag with the generated URL in the href.
  //    The Polar script will see the `data-polar-checkout` attribute and
  //    intercept the click.
  return (
    <a
      href={'/checkout?productId=' + productId} // Use the dynamic URL here
      // 'https://buy.polar.sh/polar_cl_OyedkX3Pzn0fA7cMMqsIdu5OkJzUxPRfqFbHw3xjhnO'
      // Use the dynamic URL here
      data-polar-checkout
      data-polar-checkout-theme={theme}
      className={className}
    >
      {children}
    </a>
  );
};

export default PurchaseLink;
