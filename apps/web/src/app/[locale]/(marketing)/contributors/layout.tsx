import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.contributors',
  pathname: '/contributors',
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
