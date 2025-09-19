import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Construction Solution',
  description:
    'Coordinate crews and projects with Tuturuuu for construction teams.',
};

export default function ConstructionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
