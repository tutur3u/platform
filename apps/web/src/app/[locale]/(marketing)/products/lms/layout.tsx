import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'LMS Product',
  description:
    'Deliver training and measure learning impact with Tuturuuu LMS.',
};

export default function LMSLayout({ children }: { children: ReactNode }) {
  return children;
}
