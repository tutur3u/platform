import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { InventoryAppShell } from '@/components/inventory-app-shell';
import { getNavigationLinks } from './navigation';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const requestHeaders = await headers();
  const user = getAppSessionUserFromRequest(
    { headers: requestHeaders },
    { targetApp: 'inventory' }
  );

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace) redirect('/dashboard');
  if (!workspace.joined) redirect('/dashboard');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });

  return (
    <InventoryAppShell
      links={await getNavigationLinks({ workspaceSlug })}
      workspaceName={workspace.name ?? workspaceSlug}
    >
      {children}
    </InventoryAppShell>
  );
}
