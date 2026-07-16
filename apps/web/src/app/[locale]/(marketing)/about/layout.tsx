import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'About Our Company',
  description: 'Get to know the vision, story, and team behind Tuturuuu.',
  pathname: '/about',
});

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
