import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Brand Guidelines',
  description:
    'Download Tuturuuu brand assets and learn how to use them consistently.',
};

export default function BrandingLayout({ children }: { children: ReactNode }) {
  return children;
}
