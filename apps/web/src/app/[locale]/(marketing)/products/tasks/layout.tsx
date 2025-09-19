import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Tasks Product',
  description:
    'Keep projects on track with Tuturuuu Tasks and collaborative boards.',
};

export default function TasksLayout({ children }: { children: ReactNode }) {
  return children;
}
