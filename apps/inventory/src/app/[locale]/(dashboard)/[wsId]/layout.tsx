import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SIDEBAR_BEHAVIOR_COOKIE_NAME } from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const requestHeaders = await headers();
  const user = await getSatelliteAppSessionUser('inventory');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, requestHeaders);

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/dashboard"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  if (!workspace) redirect('/dashboard');
  if (!workspace.joined) redirect('/dashboard');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });

  const cookieStore = await cookies();
  const rawBehavior = cookieStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME)?.value;
  const sidebarBehavior =
    rawBehavior === 'collapsed' || rawBehavior === 'hover'
      ? rawBehavior
      : 'expanded';
  const defaultCollapsed =
    sidebarBehavior === 'collapsed' || sidebarBehavior === 'hover';

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      <Structure
        wsId={workspace.id}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={await getNavigationLinks({ workspaceSlug })}
        actions={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
