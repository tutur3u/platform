import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.workflows.seo',
  pathname: '/products/workflows',
});

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return children;
}
