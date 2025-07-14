import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

interface TumeetLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function TumeetLayout({
  children,
  params,
}: TumeetLayoutProps) {
  const { wsId } = await params;

  // Verify workspace access
  const workspace = await getWorkspace(wsId, true);

  if (!workspace) {
    notFound();
  }

  return <div className="flex min-h-screen w-full flex-col">{children}</div>;
}
