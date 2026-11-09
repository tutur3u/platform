import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.security',
  pathname: '/security',
});

export default function SecurityLayout({ children }: { children: ReactNode }) {
  return children;
}
