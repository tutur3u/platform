import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pharmacies Solution',
  description: 'Manage pharmacy workflows and compliance with Tuturuuu.',
};

export default function PharmaciesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
