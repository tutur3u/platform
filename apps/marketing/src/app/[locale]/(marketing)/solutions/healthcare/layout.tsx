import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_healthcare',
  pathname: '/solutions/healthcare',
});

export default function HealthcareLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
