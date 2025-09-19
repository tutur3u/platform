import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Document Details',
  description:
    'Manage Document Details in the Documents area of your Tuturuuu workspace.',
};

export default function DocumentIdLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
