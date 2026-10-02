import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_realestate',
  pathname: '/solutions/realestate',
});

export default function RealestateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
