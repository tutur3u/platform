import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.hive.seo',
  pathname: '/products/hive',
});

export default function HiveLayout({ children }: { children: ReactNode }) {
  return children;
}
