import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.careers',
  pathname: '/careers',
});

export default function CareersLayout({ children }: { children: ReactNode }) {
  return children;
}
