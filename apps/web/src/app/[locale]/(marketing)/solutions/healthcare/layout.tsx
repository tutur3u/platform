import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Healthcare Solution',
  description:
    'Streamline care coordination and compliance with Tuturuuu for healthcare.',
  pathname: '/solutions/healthcare',
});

export default function HealthcareLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
