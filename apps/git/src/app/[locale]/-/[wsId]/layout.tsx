import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { ROOT_WORKSPACE_ID, toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import NavbarActions from '@/app/[locale]/navbar-actions';
import { UserNav } from '@/app/[locale]/user-nav';
import { SidebarProvider } from '@/context/sidebar-context';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}

// This authenticated shell intentionally resolves the session, root-workspace
// access, and user-specific sidebar state before rendering.
export const instant = false;

export default function Layout(props: LayoutProps) {
  return (
    <Suspense fallback={<WorkspaceLayoutSkeleton />}>
      <WorkspaceLayoutContent {...props} />
    </Suspense>
  );
}

async function WorkspaceLayoutContent({ children, params }: LayoutProps) {
  await connection();
  const [{ wsId }, user, cookieStore] = await Promise.all([
    params,
    getSatelliteAppSessionUser('git'),
    cookies(),
  ]);

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace?.joined || workspace.id !== ROOT_WORKSPACE_ID) {
    redirect('/-/internal/repositories');
  }

  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions?.containsPermission('manage_git_repositories')) {
    redirect('/tutur3u/platform');
  }

  const workspaceSlug = toWorkspaceSlug(workspace.id);
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
        wsId={workspace.id}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            permissions,
            workspaceSlug,
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
        {children}
      </Structure>
    </SidebarProvider>
  );
}

function WorkspaceLayoutSkeleton() {
  return (
    <div className="grid min-h-screen grid-cols-[4rem_1fr] md:grid-cols-[18rem_1fr]">
      <div className="border-r bg-foreground/[0.02] p-3" aria-hidden="true">
        <div className="h-10 animate-pulse rounded-lg bg-foreground/10" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-9 animate-pulse rounded-lg bg-foreground/5"
            />
          ))}
        </div>
      </div>
      <div className="space-y-4 p-4" aria-busy="true">
        <div className="h-14 animate-pulse rounded-lg bg-foreground/5" />
        <div className="h-80 animate-pulse rounded-lg bg-foreground/5" />
      </div>
    </div>
  );
}
