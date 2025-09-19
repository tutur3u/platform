import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Review the terms and conditions for using Tuturuuu products.',
};

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
