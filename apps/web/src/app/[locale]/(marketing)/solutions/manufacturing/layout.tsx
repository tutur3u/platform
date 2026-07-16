import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Manufacturing Solution',
  description: 'Synchronize production and quality operations with Tuturuuu.',
  pathname: '/solutions/manufacturing',
});

export default function ManufacturingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
