import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.forms.seo',
  pathname: '/products/forms',
});

export default function FormsLayout({ children }: { children: ReactNode }) {
  return children;
}
