import {
  getTeachBootstrap,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
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
import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { AppUserNav } from '@/components/app-user-nav';
import { redirect } from '@/i18n/navigation';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function TeachWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; wsId: string }>;
}) {
  await connection();
  const [{ locale, wsId }, requestHeaders, cookieStore] = await Promise.all([
    params,
    headers(),
    cookies(),
  ]);
  let bootstrap: Awaited<ReturnType<typeof getTeachBootstrap>>;
  try {
    bootstrap = await getTeachBootstrap(
      withForwardedInternalApiAuth(requestHeaders)
    );
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      return redirect({ href: `/login?next=/${wsId}&refresh=1`, locale });
    }

    throw error;
  }

  const workspace = bootstrap.workspaces.find(
    (candidate) => candidate.id === wsId
  );

  if (!workspace) {
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

    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}` : '/dashboard',
      locale,
    });
  }

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
        bootstrap={bootstrap}
        defaultCollapsed={defaultCollapsed}
        footerActions={
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationPopover userId={bootstrap.profile.id} />
            <AppUserNav />
          </div>
        }
        links={await getNavigationLinks(wsId)}
        notificationPopover={
          <NotificationPopover userId={bootstrap.profile.id} />
        }
        userPopover={<AppUserNav />}
        workspace={workspace}
        wsId={wsId}
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}
