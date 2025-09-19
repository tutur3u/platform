import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Retail Solution',
  description:
    'Connect stores, inventory, and customer communications with Tuturuuu.',
};

export default function RetailLayout({ children }: { children: ReactNode }) {
  return children;
}
