import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Careers at Tuturuuu',
  description:
    'Discover open roles and learn what it is like to build Tuturuuu.',
};

export default function CareersLayout({ children }: { children: ReactNode }) {
  return children;
}
