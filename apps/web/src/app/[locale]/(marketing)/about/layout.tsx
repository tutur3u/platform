import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'About Tuturuuu',
  description: 'Get to know the vision, story, and team behind Tuturuuu.',
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
