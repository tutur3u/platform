import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Customer Relationship Management',
  description:
    'Track relationships and deals inside the connected Tuturuuu CRM.',
  pathname: '/products/crm',
});

export default function CRMLayout({ children }: { children: ReactNode }) {
  return children;
}
