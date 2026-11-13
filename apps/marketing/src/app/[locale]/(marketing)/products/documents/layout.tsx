import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.documents.seo',
  pathname: '/products/documents',
});

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return children;
}
