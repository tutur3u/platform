import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Inventory Product',
  description:
    'Monitor stock levels and fulfillment workflows with Tuturuuu Inventory.',
};

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return children;
}
