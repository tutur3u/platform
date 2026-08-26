import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Products',
  description:
    'Every Tuturuuu app in one place — plan and execute, create and share, run the business.',
  pathname: '/products',
});

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return children;
}
