import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import type { PermissionId } from '@tuturuuu/types';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId } = await params;
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID) notFound();

  const requestHeaders = await headers();

  const user = await getSatelliteAppSessionUser('infra');
  if (!user?.id) redirect('/login');

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    notFound();
  }

  const workspace = await getWorkspace(ROOT_WORKSPACE_ID, {
    useAdmin: true,
    user,
  });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      requestHeaders
    );

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  if (!workspace) redirect('/onboarding');
  if (!workspace.joined) redirect('/');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });
  const cookieStore = await cookies();
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
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
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            canManageInternalAccounts: permissions.containsPermission(
              'manage_internal_accounts' as PermissionId
            ),
            personalOrWsId: workspaceSlug,
          })
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
        workspace={workspace}
        wsId={workspaceSlug}
      >
        <RealtimeLogProvider wsId={workspace.id}>
          {children}
        </RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
