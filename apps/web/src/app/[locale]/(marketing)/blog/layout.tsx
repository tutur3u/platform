import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Tuturuuu Blog',
  description:
    'Insights and stories about productivity, AI, and modern teamwork from Tuturuuu.',
};

export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}
