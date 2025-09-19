import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Tuturuuu Platform',
  description: 'Discover Tuturuuu\'s AI-powered workspace platform for teams.',
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
