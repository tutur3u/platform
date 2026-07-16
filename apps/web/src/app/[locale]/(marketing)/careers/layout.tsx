import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Careers',
  description:
    'Discover open roles and learn what it is like to build Tuturuuu.',
  pathname: '/careers',
});

export default function CareersLayout({ children }: { children: ReactNode }) {
  return children;
}
