import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_lab')) redirect(`/${wsId}`);

  return children;
}
