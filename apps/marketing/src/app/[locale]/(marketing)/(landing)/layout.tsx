import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.home',
  pathname: '/',
});

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
