import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Construction Solution',
  description:
    'Coordinate crews and projects with Tuturuuu for construction teams.',
  pathname: '/solutions/construction',
});

export default function ConstructionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
