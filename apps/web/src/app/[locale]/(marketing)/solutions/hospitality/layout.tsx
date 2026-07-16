import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Hospitality Solution',
  description:
    'Deliver memorable guest experiences using Tuturuuu in hospitality.',
  pathname: '/solutions/hospitality',
});

export default function HospitalityLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
