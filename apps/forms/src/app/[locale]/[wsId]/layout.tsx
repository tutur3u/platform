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
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../navbar-actions';
import { UserNav } from '../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default function Layout(props: LayoutProps) {
  return (
    <Suspense fallback={<WorkspaceLayoutSkeleton />}>
      <WorkspaceLayoutContent {...props} />
    </Suspense>
  );
}

async function WorkspaceLayoutContent({ children, params }: LayoutProps) {
  await connection();

  const { wsId: id } = await params;
  const requestHeaders = await headers();
  const user = await getSatelliteAppSessionUser('forms');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, requestHeaders);

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/dashboard"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  if (!workspace) redirect('/dashboard');
  if (!workspace.joined) redirect('/dashboard');

  const workspaceSlug = toWorkspaceSlug(workspace.id, {
    personal: !!workspace.personal,
  });

  const permissions = await getPermissions({ user, wsId: workspace.id });

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
        wsId={workspace.id}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            permissions: permissions ?? undefined,
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
          {Array.from({ length: 8 }, (_, index) => (
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
