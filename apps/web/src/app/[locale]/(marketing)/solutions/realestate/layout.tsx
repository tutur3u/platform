import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Real Estate Solution',
  description:
    'Organize listings, deals, and client updates with Tuturuuu for real estate.',
};

export default function RealestateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
