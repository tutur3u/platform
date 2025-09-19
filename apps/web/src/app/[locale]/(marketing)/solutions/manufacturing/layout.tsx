import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Manufacturing Solution',
  description: 'Synchronize production and quality operations with Tuturuuu.',
};

export default function ManufacturingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
