import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_pharmacies',
  pathname: '/solutions/pharmacies',
});

export default function PharmaciesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
