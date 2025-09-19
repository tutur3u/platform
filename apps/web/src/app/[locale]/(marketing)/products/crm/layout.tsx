import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CRM Product',
  description:
    'Track relationships and deals inside the connected Tuturuuu CRM.',
};

export default function CRMLayout({ children }: { children: ReactNode }) {
  return children;
}
