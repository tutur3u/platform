import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.lms.seo',
  pathname: '/products/lms',
});

export default function LmsLayout({ children }: { children: ReactNode }) {
  return children;
}
