import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Productivity, AI, and Teamwork Blog',
  description:
    'Insights and stories about productivity, AI, and modern teamwork from Tuturuuu.',
  pathname: '/blog',
});

export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}
