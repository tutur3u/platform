import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Learn how Tuturuuu collects, stores, and protects customer data.',
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
