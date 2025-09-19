import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Restaurant Solution',
  description:
    'Run restaurant operations, scheduling, and loyalty with Tuturuuu.',
};

export default function RestaurantsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
