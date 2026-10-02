import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_manufacturing',
  pathname: '/solutions/manufacturing',
});

export default function ManufacturingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
