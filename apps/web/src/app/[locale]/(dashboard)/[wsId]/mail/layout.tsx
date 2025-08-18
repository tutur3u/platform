import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
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
  const user = await getCurrentSupabaseUser();

  if (!workspace.personal) redirect(`/personal/mail`);
  if (
    !user?.email?.endsWith('@tuturuuu.com') &&
    !user?.email?.endsWith('@xwf.tuturuuu.com')
  )
    redirect(`/personal`);

  return children;
}
