import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.privacy',
  pathname: '/privacy',
});

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
