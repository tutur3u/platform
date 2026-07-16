import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'AI Workspace',
  description:
    'See how Tuturuuu AI accelerates automation and everyday workflows.',
  pathname: '/products/ai',
});

export default function AILayout({ children }: { children: ReactNode }) {
  return children;
}
