import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.about',
  pathname: '/about',
});

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
