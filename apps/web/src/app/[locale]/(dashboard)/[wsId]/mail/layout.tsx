import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
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
if (!workspace) notFound();
  const user = await getCurrentSupabaseUser();

  if (!workspace.personal) redirect(`/personal/mail`);
  if (!isValidTuturuuuEmail(user?.email)) redirect(`/personal`);

  return children;
}
