import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.meet-together.seo',
  pathname: '/products/meet-together',
});

export default function MeetTogetherLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
