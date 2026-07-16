import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Retail Solution',
  description:
    'Connect stores, inventory, and customer communications with Tuturuuu.',
  pathname: '/solutions/retail',
});

export default function RetailLayout({ children }: { children: ReactNode }) {
  return children;
}
