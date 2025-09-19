import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Finance Product',
  description:
    'Manage invoices, budgets, and spend control with Tuturuuu Finance.',
};

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return children;
}
