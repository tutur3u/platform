import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Workflows Product',
  description: 'Automate cross-team processes with Tuturuuu Workflows.',
};

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return children;
}
