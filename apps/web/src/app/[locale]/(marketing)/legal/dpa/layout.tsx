import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.legal_dpa',
  pathname: '/legal/dpa',
});

export default function DpaLayout({ children }: { children: ReactNode }) {
  return children;
}
