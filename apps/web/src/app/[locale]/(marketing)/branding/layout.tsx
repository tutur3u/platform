import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Brand Guidelines',
  description:
    'Download Tuturuuu brand assets and learn how to use them consistently.',
  pathname: '/branding',
});

export default function BrandingLayout({ children }: { children: ReactNode }) {
  return children;
}
