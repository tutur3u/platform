import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for Tuturuuu JSC — how we collect, process, and protect your data as an open-source platform.',
};

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
