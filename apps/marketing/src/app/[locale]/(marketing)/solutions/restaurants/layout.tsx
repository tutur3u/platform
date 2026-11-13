import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_restaurants',
  pathname: '/solutions/restaurants',
});

export default function RestaurantsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
