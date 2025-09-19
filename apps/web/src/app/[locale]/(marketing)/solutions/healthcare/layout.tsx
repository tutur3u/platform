import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Healthcare Solution',
  description:
    'Streamline care coordination and compliance with Tuturuuu for healthcare.',
};

export default function HealthcareLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
