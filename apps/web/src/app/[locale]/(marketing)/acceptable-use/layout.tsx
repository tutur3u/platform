import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Acceptable Use Policy',
  description:
    'Acceptable Use Policy for Tuturuuu JSC — permitted and prohibited uses of our platform and services.',
  pathname: '/acceptable-use',
});

export default function AcceptableUseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
