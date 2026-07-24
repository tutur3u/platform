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
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceTier,
} from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import {
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
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

type CmsWorkspace = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;

async function getRootManagedWorkspace(
  workspaceId: string
): Promise<CmsWorkspace | null> {
  const admin = await createAdminClient({ noCookie: true });
  const [{ data, error }, tier] = await Promise.all([
    admin.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
    getWorkspaceTier(workspaceId, { useAdmin: true }),
  ]);

  if (error || !data) return null;

  return {
    ...data,
    joined: true,
    tier,
  } as CmsWorkspace;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const resolvedWorkspaceId = resolveWorkspaceId(id);
  const requestHeaders = await headers();

  const user = await getSatelliteAppSessionUser('cms');
  if (!user?.id) redirect('/login');

  const isInternalWorkspace = resolvedWorkspaceId === ROOT_WORKSPACE_ID;
  let workspace: CmsWorkspace | null = isInternalWorkspace
    ? ({
        id: ROOT_WORKSPACE_ID,
        joined: true,
        personal: false,
        tier: null,
      } as CmsWorkspace)
    : await getWorkspace(resolvedWorkspaceId, {
        useAdmin: true,
        user,
      });

  let canManageBoundWorkspace = false;

  if (isInternalWorkspace) {
    const rootPermissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });

    if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
      redirect('/no-access');
    }
  } else if (!workspace?.joined) {
    const rootPermissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });

    if (hasRootExternalProjectsAdminPermission(rootPermissions)) {
      const binding =
        await resolveWorkspaceExternalProjectBinding(resolvedWorkspaceId);

      canManageBoundWorkspace =
        binding.enabled && Boolean(binding.canonical_project);

      if (canManageBoundWorkspace && !workspace) {
        workspace = await getRootManagedWorkspace(resolvedWorkspaceId);
      }
    }
  }

  if (!workspace) redirect('/no-access');

  if (!workspace.joined) {
    const invitation = await getPendingWorkspaceInvitation(
      resolvedWorkspaceId,
      requestHeaders
    );

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

  if (!workspace.joined && !canManageBoundWorkspace) redirect('/');

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
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            personalOrWsId: workspaceSlug,
            workspaceId: wsId,
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
        <RealtimeLogProvider wsId={wsId}>{children}</RealtimeLogProvider>
      </Structure>
    </SidebarProvider>
  );
}
