import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Finance and Expense Management',
  description:
    'Manage invoices, budgets, and spend control with Tuturuuu Finance.',
  pathname: '/products/finance',
});

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
