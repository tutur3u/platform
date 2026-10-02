import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.legal_sla',
  pathname: '/legal/sla',
});

export default function SlaLayout({ children }: { children: ReactNode }) {
  return children;
}
