import {
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { getPendingWorkspaceInvitation } from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { AppUserNav } from '@/components/app-user-nav';
import { Brand } from '@/components/brand';
import { WorkspaceInvitation } from '@/components/workspace-invitation';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';
import Loading from './wiki/loading';
export const metadata = { robots: { index: false, follow: false } };
type LayoutProps = {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
};

export default function Layout(props: LayoutProps) {
  return (
    <Suspense fallback={<Loading />}>
      <WorkspaceLayout {...props} />
    </Suspense>
  );
}

async function WorkspaceLayout({ children, params }: LayoutProps) {
  await connection();
  const { wsId } = await params;
  const user = await getSatelliteAppSessionUser('lettin');
  if (!user) redirect('/login');
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      wsId,
      await headers()
    );
    if (invitation)
      return (
        <div className="notebook-theme min-h-screen">
          <Brand />
          <WorkspaceInvitation invitation={invitation} />
        </div>
      );
    redirect('/dashboard');
  }
  const workspaces = await listWorkspaces(
    withForwardedInternalApiAuth(await headers())
  );
  const cookieStore = await cookies();
  const behavior = parseSidebarBehavior(cookieStore);
  return (
    <WorkspaceVisibilityProvider actorId={user.id}>
      <SidebarProvider
        initialBehavior={behavior}
        initialBehaviorUpdatedAt={getSidebarBehaviorUpdatedAt(cookieStore)}
      >
        <Structure
          wsId={workspace.id}
          actorId={user.id}
          workspace={workspace}
          workspaces={workspaces}
          links={await getNavigationLinks(workspace.id, user.id)}
          defaultCollapsed={getSidebarCollapsedState(cookieStore, behavior)}
          actions={
            <>
              <AppUserNav />
              <NotificationPopover userId={user.id} />
            </>
          }
          userPopover={<AppUserNav hideMetadata />}
          notificationPopover={<NotificationPopover userId={user.id} />}
        >
          {children}
        </Structure>
      </SidebarProvider>
    </WorkspaceVisibilityProvider>
  );
}
