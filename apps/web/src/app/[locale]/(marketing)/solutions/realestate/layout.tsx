import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Real Estate Solution',
  description:
    'Organize listings, deals, and client updates with Tuturuuu for real estate.',
  pathname: '/solutions/realestate',
});

export default function RealestateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
