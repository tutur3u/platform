import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Workspace',
  description:
    'See how Tuturuuu AI accelerates automation and everyday workflows.',
};

export default function AILayout({ children }: { children: ReactNode }) {
  return children;
}
