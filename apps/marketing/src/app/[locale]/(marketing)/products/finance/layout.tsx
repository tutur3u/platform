import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.finance.seo',
  pathname: '/products/finance',
});

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
