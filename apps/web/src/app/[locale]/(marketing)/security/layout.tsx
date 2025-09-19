import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Security at Tuturuuu',
  description:
    'Read about the Tuturuuu approach to security, compliance, and data protection.',
};

export default function SecurityLayout({ children }: { children: ReactNode }) {
  return children;
}
