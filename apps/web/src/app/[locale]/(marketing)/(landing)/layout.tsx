import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Landing Page',
  description:
    "Discover Tuturuuu's AI-powered workspace for you, your team, and everyone.",
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
