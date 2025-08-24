import FinanceLayout from '@tuturuuu/ui/finance/finance-layout';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId } = await params;

  return <FinanceLayout wsId={wsId}>{children}</FinanceLayout>;
}
