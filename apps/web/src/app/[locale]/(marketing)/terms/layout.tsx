import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.terms',
  pathname: '/terms',
});

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
