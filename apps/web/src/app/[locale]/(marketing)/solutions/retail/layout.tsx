import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_retail',
  pathname: '/solutions/retail',
});

export default function RetailLayout({ children }: { children: ReactNode }) {
  return children;
}
