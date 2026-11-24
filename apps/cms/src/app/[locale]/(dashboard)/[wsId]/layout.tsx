import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
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
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '@tuturuuu/utils/constants';
import {
  getWorkspace,
  getWorkspaceTier,
} from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import {
  getCmsWorkspaceAccess,
  hasRootExternalProjectsAdminPermission,
  resolveWorkspaceExternalProjectBinding,
} from '@/lib/external-projects/access';
import { getCmsRootPermissions } from '@/lib/external-projects/root-permissions';
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

const ignoreRejection = () => {};
const WORKSPACE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  await connection();
  const { wsId: id } = await params;
  const resolvedWorkspaceId = resolveWorkspaceId(id);
  const requestHeaders = await headers();

  const user = await getSatelliteAppSessionUser('cms');
  if (!user?.id) redirect('/login');

  const isInternalWorkspace = resolvedWorkspaceId === ROOT_WORKSPACE_ID;

  // The reads below do not depend on each other, so they start together. Each
  // result is only consulted behind the same checks as a sequential flow, and
  // a rejection surfaces only where it is awaited.
  const workspacePromise: Promise<CmsWorkspace | null> = isInternalWorkspace
    ? Promise.resolve({
        id: ROOT_WORKSPACE_ID,
        joined: true,
        personal: false,
        tier: null,
      } as CmsWorkspace)
    : getWorkspace(resolvedWorkspaceId, {
        useAdmin: true,
        user,
      });
  const rootPermissionsPromise = getCmsRootPermissions(
    user.id,
    user.email ?? null
  );
  // The binding is keyed by workspace id, so only a literal UUID can be read
  // ahead of the workspace lookup; handles and aliases read it on demand.
  const bindingPromise =
    !isInternalWorkspace && WORKSPACE_UUID_PATTERN.test(resolvedWorkspaceId)
      ? resolveWorkspaceExternalProjectBinding(resolvedWorkspaceId)
      : null;
  rootPermissionsPromise.catch(ignoreRejection);
  bindingPromise?.catch(ignoreRejection);
  if (!isInternalWorkspace) {
    // Warms the per-request access cache that navigation and pages read.
    getCmsWorkspaceAccess(id).catch(ignoreRejection);
  }

  let workspace = await workspacePromise;
  let canManageBoundWorkspace = false;

  if (isInternalWorkspace) {
    const rootPermissions = await rootPermissionsPromise;

    if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
      redirect('/no-access');
    }
  } else if (!workspace?.joined) {
    const rootPermissions = await rootPermissionsPromise;

    if (hasRootExternalProjectsAdminPermission(rootPermissions)) {
      const binding = await (bindingPromise ??
        resolveWorkspaceExternalProjectBinding(resolvedWorkspaceId));

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
    <WorkspaceVisibilityProvider actorId={user.id}>
      <SidebarProvider
        initialBehavior={sidebarBehavior}
        initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
      >
        <Structure
          wsId={wsId}
          workspace={workspace}
          defaultCollapsed={defaultCollapsed}
          links={await getNavigationLinks({
            accessWorkspaceId: id,
            personalOrWsId: workspaceSlug,
            workspaceId: wsId,
          })}
          actions={
            <Suspense
              key={user.id}
              fallback={
                <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
              }
            >
              <NavbarActions userId={user.id} />
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
    </WorkspaceVisibilityProvider>
  );
}
