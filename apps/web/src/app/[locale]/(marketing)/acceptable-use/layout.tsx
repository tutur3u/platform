import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy',
  description:
    'Acceptable Use Policy for Tuturuuu JSC — permitted and prohibited uses of our platform and services.',
};

export default function AcceptableUseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
