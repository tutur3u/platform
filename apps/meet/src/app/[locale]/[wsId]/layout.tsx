import NavbarActions from '@tuturuuu/satellite/navbar-actions';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { UserNav } from '@tuturuuu/satellite/user-nav';
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
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';
import { getMeetWorkspaceContext } from './workspace-context';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  await connection();
  const [{ wsId: id }, cookieStore, requestHeaders] = await Promise.all([
    params,
    cookies(),
    headers(),
  ]);
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

  const { user, workspace, workspaceSlug, wsId } =
    await getMeetWorkspaceContext(id);
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
            <NavbarActions userId={user.id} />
          </Suspense>
        }
        defaultCollapsed={defaultCollapsed}
        links={await getNavigationLinks({ workspaceSlug })}
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
        workspace={workspace}
        wsId={wsId}
      >
        <RealtimeLogProvider wsId={wsId}>
          <div data-workspace-slug={workspaceSlug}>{children}</div>
        </RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
