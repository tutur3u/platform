import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Contact Tuturuuu',
  description:
    'Reach out to the Tuturuuu team for support, partnerships, or general questions.',
};

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
