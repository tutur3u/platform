import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
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
import { WorkspacePresenceProvider } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper';
import { TasksRouteProvider } from '@tuturuuu/tasks-ui/tu-do/tasks-route-context';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { TasksCommandLauncher } from '@/components/command-center/tasks-command-launcher';
import { SettingsDialogHost } from '@/components/settings/settings-dialog-host';
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

// This authenticated shell resolves the app session, workspace membership, and
// user-specific sidebar state before it can render. It is intentionally a
// blocking route rather than an instant-navigation shell.
export const instant = false;

export default async function Layout({ children, params }: LayoutProps) {
  await connection();

  const { wsId: id } = await params;
  const requestHeaders = await headers();

  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, requestHeaders);

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

  if (!workspace) notFound();
  if (!workspace?.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  const cookieStore = await cookies();
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );
  const navigationLinks = await getNavigationLinks({
    personalOrWsId: workspaceSlug,
  });

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
        wsId={wsId}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={navigationLinks}
        actions={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions userId={user.id} />
          </Suspense>
        }
        notificationPopover={<NotificationPopover userId={user.id} />}
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
        <TasksRouteProvider prefix="">
          <RealtimeLogProvider wsId={wsId}>
            <WorkspacePresenceProvider
              wsId={wsId}
              tier={workspace.tier ?? null}
              enabled={!workspace.personal}
            >
              <TaskDialogWrapper
                isPersonalWorkspace={!!workspace.personal}
                routePrefix=""
                wsId={wsId}
              >
                <SettingsDialogHost
                  user={user}
                  workspace={workspace}
                  wsId={wsId}
                />
                <TasksCommandLauncher
                  isPersonalWorkspace={!!workspace.personal}
                  navLinks={navigationLinks}
                  workspaceSlug={workspaceSlug}
                  wsId={wsId}
                />
                {children}
              </TaskDialogWrapper>
            </WorkspacePresenceProvider>
          </RealtimeLogProvider>
        </TasksRouteProvider>
      </Structure>
    </SidebarProvider>
  );
}
