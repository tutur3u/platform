import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import { getSidebarBehaviorUpdatedAt } from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { TasksRouteProvider } from '@tuturuuu/ui/tu-do/tasks-route-context';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
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

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });

  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = cookieStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);

  const rawBehavior = behaviorCookie?.value;
  const isValidBehavior = (
    value: string | undefined
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
  }

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
        wsId={wsId}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            personalOrWsId: workspaceSlug,
          })
        }
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
        <TasksRouteProvider prefix="">
          <RealtimeLogProvider wsId={wsId}>
            <WorkspacePresenceProvider
              wsId={wsId}
              tier={workspace.tier ?? null}
              enabled={!workspace.personal}
            >
              <TaskDialogWrapper
                isPersonalWorkspace={!!workspace.personal}
                wsId={wsId}
              >
                {children}
              </TaskDialogWrapper>
            </WorkspacePresenceProvider>
          </RealtimeLogProvider>
        </TasksRouteProvider>
      </Structure>
    </SidebarProvider>
  );
}
