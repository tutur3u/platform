import type { TulearnBootstrapResponse } from '@tuturuuu/internal-api';
import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
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
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import { AppUserNav } from '@/components/app-user-nav';
import { NoWorkspaceState } from '@/components/learner-shell';
import { redirect } from '@/i18n/navigation';
import {
  getLearnRenderBootstrap,
  isLearnBootstrapAuthFailure,
} from '@/lib/render-bootstrap';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}) {
  await connection();
  const [{ locale, wsId }, requestHeaders, cookieStore] = await Promise.all([
    params,
    headers(),
    cookies(),
  ]);
  let bootstrap: TulearnBootstrapResponse;
  try {
    bootstrap = await getLearnRenderBootstrap();
  } catch (error) {
    if (isLearnBootstrapAuthFailure(error)) {
      return redirect({ href: `/login?next=/${wsId}&refresh=1`, locale });
    }

    throw error;
  }

  if (!bootstrap.workspaces.length) {
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

    return <NoWorkspaceState />;
  }

  if (!bootstrap.workspaces.some((workspace) => workspace.id === wsId)) {
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

    const fallbackWorkspace = bootstrap.workspaces[0];
    return fallbackWorkspace ? (
      redirect({ href: `/${fallbackWorkspace.id}`, locale })
    ) : (
      <NoWorkspaceState />
    );
  }

  const sidebarBehavior = parseSidebarBehavior(cookieStore);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);
  const defaultCollapsed = getSidebarCollapsedState(
    cookieStore,
    sidebarBehavior
  );

  const menuProfile =
    runtimeAppBase() === '/lms/learn' ? bootstrap.profile : undefined;

  return (
    <WorkspaceVisibilityProvider actorId={bootstrap.profile.id}>
      <SidebarProvider
        initialBehavior={sidebarBehavior}
        initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
      >
        <Structure
          bootstrap={bootstrap}
          defaultCollapsed={defaultCollapsed}
          footerActions={
            <>
              <div className="min-w-0 flex-1">
                <AppUserNav profile={menuProfile} />
              </div>
              <NotificationPopover userId={bootstrap.profile.id} />
            </>
          }
          links={await getNavigationLinks(wsId)}
          notificationPopover={
            <NotificationPopover userId={bootstrap.profile.id} />
          }
          userPopover={<AppUserNav hideMetadata profile={menuProfile} />}
          wsId={wsId}
        >
          {children}
        </Structure>
      </SidebarProvider>
    </WorkspaceVisibilityProvider>
  );
}
