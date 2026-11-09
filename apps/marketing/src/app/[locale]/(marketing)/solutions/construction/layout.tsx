import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_construction',
  pathname: '/solutions/construction',
});

export default function ConstructionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
