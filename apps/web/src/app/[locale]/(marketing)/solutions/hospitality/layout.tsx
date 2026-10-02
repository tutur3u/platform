import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_hospitality',
  pathname: '/solutions/hospitality',
});

export default function HospitalityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
