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
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { resolveRewiseWorkspace } from './helper';
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

  const { user, workspace } = await resolveRewiseWorkspace(id);

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

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
        wsId={wsId}
        personalOrWsId={workspaceSlug}
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
        <RealtimeLogProvider wsId={wsId}>{children}</RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
