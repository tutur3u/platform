import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Hospitality Solution',
  description:
    'Deliver memorable guest experiences using Tuturuuu in hospitality.',
};

export default function HospitalityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
