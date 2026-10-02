import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.blog',
  pathname: '/blog',
});

export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}
