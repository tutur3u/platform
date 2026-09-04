import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketing-nav.index.seo',
  pathname: '/products',
});

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return children;
}
