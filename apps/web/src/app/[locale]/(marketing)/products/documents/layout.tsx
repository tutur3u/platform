import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Documents Product',
  description: 'Collaborate on docs with AI-assisted workflows in Tuturuuu.',
  pathname: '/products/documents',
});

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return children;
}
