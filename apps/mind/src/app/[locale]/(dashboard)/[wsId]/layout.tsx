import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import { requireMindUser } from '@/lib/access';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
};

export default async function MindWorkspaceLayout({
  children,
  params,
}: LayoutProps) {
  const [{ wsId }, user, cookieStore, requestHeaders] = await Promise.all([
    params,
    requireMindUser(),
    cookies(),
    headers(),
  ]);
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      requestHeaders
    );

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
  const sidebarBehavior = parseSidebarBehavior(cookieStore, 'collapsed');
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
        links={await getNavigationLinks({ workspaceSlug })}
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
        workspaceSlug={workspaceSlug}
        wsId={workspace.id}
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
