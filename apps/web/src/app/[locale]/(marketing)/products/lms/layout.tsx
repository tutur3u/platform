import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Learning Management System',
  description:
    'Deliver training and measure learning impact with Tuturuuu LMS.',
  pathname: '/products/lms',
});

export default function LMSLayout({ children }: { children: ReactNode }) {
  return children;
}
