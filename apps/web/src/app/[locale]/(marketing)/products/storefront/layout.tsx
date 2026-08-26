import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.storefront.seo',
  pathname: '/products/storefront',
});

export default function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
