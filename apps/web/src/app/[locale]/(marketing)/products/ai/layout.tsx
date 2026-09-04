import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.ai.seo',
  pathname: '/products/ai',
});

export default function AiLayout({ children }: { children: ReactNode }) {
  return children;
}
