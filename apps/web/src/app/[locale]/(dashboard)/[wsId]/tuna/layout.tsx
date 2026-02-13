import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function TunaLayout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  // Tuna is only available in personal workspaces
  if (!workspace.personal) {
    redirect(`/personal/tuna`);
  }

  return children;
}
