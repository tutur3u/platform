import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.branding',
  pathname: '/branding',
});

export default function BrandingLayout({ children }: { children: ReactNode }) {
  return children;
}
