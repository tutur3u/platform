import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Inventory Management',
  description:
    'Monitor stock levels and fulfillment workflows with Tuturuuu Inventory.',
  pathname: '/products/inventory',
});

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return children;
}
