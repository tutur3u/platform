import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Pharmacies Solution',
  description: 'Manage pharmacy workflows and compliance with Tuturuuu.',
  pathname: '/solutions/pharmacies',
});

export default function PharmaciesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
