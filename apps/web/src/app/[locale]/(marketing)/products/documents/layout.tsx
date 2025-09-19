import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Documents Product',
  description: 'Collaborate on docs with AI-assisted workflows in Tuturuuu.',
};

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return children;
}
