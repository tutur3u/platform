import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for Tuturuuu JSC — an open-source AI-powered productivity platform incorporated in Vietnam.',
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
