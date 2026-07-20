import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
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
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { WorkspacePresenceProvider } from '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { CalendarNavigationProvider } from '@/components/calendar-navigation-provider';
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

  const user = await getSatelliteAppSessionUser('calendar');
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

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined) redirect('/');

  const wsId = workspace.id;
  const cookieStore = await cookies();
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: calendarConnections } = await sbAdmin
    .from('calendar_connections')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: true });

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <CalendarNavigationProvider>
        <CalendarSyncProvider
          initialCalendarConnections={calendarConnections || []}
          wsId={wsId}
        >
          <Structure
            wsId={wsId}
            workspace={workspace}
            defaultCollapsed={defaultCollapsed}
            links={await getNavigationLinks()}
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
            <RealtimeLogProvider wsId={wsId}>
              <WorkspacePresenceProvider
                wsId={wsId}
                tier={workspace.tier ?? null}
                enabled={!workspace.personal}
              >
                {children}
              </WorkspacePresenceProvider>
            </RealtimeLogProvider>
          </Structure>
        </CalendarSyncProvider>
      </CalendarNavigationProvider>
    </SidebarProvider>
  );
}
