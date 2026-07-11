import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function MiraLayout({ children, params }: LayoutProps) {
  await connection();

  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  // Mira is only available in personal workspaces
  if (!workspace?.personal) {
    redirect(`/personal/mira`);
  }

  return children;
}
