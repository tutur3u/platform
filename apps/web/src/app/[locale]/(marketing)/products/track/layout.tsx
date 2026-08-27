import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.track.seo',
  pathname: '/products/track',
});

export default function TrackLayout({ children }: { children: ReactNode }) {
  return children;
}
