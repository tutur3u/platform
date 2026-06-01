import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import NavbarActions from '@tuturuuu/satellite/navbar-actions';
import { SidebarProvider } from '@tuturuuu/satellite/sidebar-context';
import { UserNav } from '@tuturuuu/satellite/user-nav';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const requestHeaders = await headers();
  const user = getAppSessionUserFromRequest(
    { headers: requestHeaders },
    { targetApp: 'mail' }
  );

  if (!user?.id) redirect('/login');
  if (!isExactTuturuuuDotComEmail(user.email)) redirect('/not-available');

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
  if (!workspace.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });
  const cookieStore = await cookies();
  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );

  return (
    <SidebarProvider initialBehavior={sidebarBehavior}>
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
        links={await getNavigationLinks({ personalOrWsId: workspaceSlug })}
        personalOrWsId={workspaceSlug}
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
