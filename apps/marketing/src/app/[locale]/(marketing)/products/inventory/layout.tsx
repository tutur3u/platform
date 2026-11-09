import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.inventory.seo',
  pathname: '/products/inventory',
});

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return children;
}
