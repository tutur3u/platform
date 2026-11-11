import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.tasks.seo',
  pathname: '/products/tasks',
});

export default function TasksLayout({ children }: { children: ReactNode }) {
  return children;
}
