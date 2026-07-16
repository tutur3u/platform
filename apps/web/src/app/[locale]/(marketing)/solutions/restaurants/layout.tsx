import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Restaurant Solution',
  description:
    'Run restaurant operations, scheduling, and loyalty with Tuturuuu.',
  pathname: '/solutions/restaurants',
});

export default function RestaurantsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
