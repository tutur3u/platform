import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
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

export default function GitAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  return (
    <Suspense fallback={<AdminLayoutSkeleton />}>
      <GitAdminLayoutContent params={params}>{children}</GitAdminLayoutContent>
    </Suspense>
  );
}

async function GitAdminLayoutContent({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;
  const user = await getSatelliteAppSessionUser('git');
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
        actions={
          <Suspense
            fallback={<div className="h-10 w-20 rounded-lg bg-muted" />}
          >
            <NavbarActions />
          </Suspense>
        }
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            permissions: permissions ?? undefined,
            workspaceSlug,
          })
        }
        userPopover={
          <Suspense
            fallback={<div className="h-10 w-10 rounded-lg bg-muted" />}
          >
            <UserNav hideMetadata />
          </Suspense>
        }
        workspace={workspace}
        wsId={workspace.id}
      >
        {children}
      </Structure>
    </SidebarProvider>
  );
}

function AdminLayoutSkeleton() {
  return (
    <div className="grid min-h-screen grid-cols-[4rem_1fr] md:grid-cols-[18rem_1fr]">
      <div className="border-r p-3">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="space-y-4 p-6">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
