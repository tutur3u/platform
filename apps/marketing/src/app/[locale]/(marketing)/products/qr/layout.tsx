import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.qr.seo',
  pathname: '/products/qr',
});

export default function QrLayout({ children }: { children: ReactNode }) {
  return children;
}
