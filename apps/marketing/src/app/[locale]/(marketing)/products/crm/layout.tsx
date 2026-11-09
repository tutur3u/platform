import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.crm.seo',
  pathname: '/products/crm',
});

export default function CrmLayout({ children }: { children: ReactNode }) {
  return children;
}
