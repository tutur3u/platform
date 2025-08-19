import FinanceLayout from '@tuturuuu/ui/finance/finance-layout';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  return <FinanceLayout wsId={wsId}>{children}</FinanceLayout>;
}
