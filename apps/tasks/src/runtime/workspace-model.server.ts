import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPendingWorkspaceInvitation } from '@tuturuuu/satellite/workspace-invitation';
import {
  getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState,
  parseSidebarBehavior,
} from '@tuturuuu/satellite/workspace-layout-helpers';
import { cookies, headers } from '@tuturuuu/start-bridge/next/headers';
import { notFound, redirect } from '@tuturuuu/start-bridge/next/navigation';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getRequestWorkspace } from '@tuturuuu/utils/request-workspace';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { readShellProfile } from './shell-profile.server';

/**
 * The `[wsId]` layout's guards as data: an app session, then membership or a
 * pending invitation, then the sidebar state the shell renders with.
 */
export async function workspaceModel(id: string) {
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');
  // The profile read does not depend on the workspace guards, so it overlaps
  // them instead of running after them. A guard that redirects leaves it
  // settled and unused.
  const profilePromise = readShellProfile(user);
  profilePromise.catch(() => {});
  // Permissions resolve the route id and authorize the actor on their own, so
  // they overlap the workspace guard too and are read only once it passes.
  const permissionsPromise = getPermissions({ user, wsId: id });
  permissionsPromise.catch(() => {});
  const workspace = await getRequestWorkspace(id, { useAdmin: true, user });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, await headers());
    if (invitation) return { kind: 'invitation' as const, invitation };
  }
  if (!workspace) notFound();
  if (!workspace.joined) redirect('/');
  const cookieStore = await cookies();
  const behavior = parseSidebarBehavior(cookieStore);
  const [routePermissions, profile] = await Promise.all([
    permissionsPromise,
    profilePromise,
  ]);
  // A route id the permission resolver does not know falls back to the
  // workspace id the guard resolved.
  const permissions =
    routePermissions ??
    (id === workspace.id
      ? null
      : await getPermissions({ user, wsId: workspace.id }));
  return {
    kind: 'workspace' as const,
    workspace,
    slug: toWorkspaceSlug(workspace.id, { personal: !!workspace.personal }),
    user,
    profile,
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(cookieStore),
    defaultCollapsed: getSidebarCollapsedState(cookieStore, behavior),
    canManageCycles: !!permissions?.containsPermission('manage_projects'),
  };
}

export type TasksWorkspaceModel = Extract<
  Awaited<ReturnType<typeof workspaceModel>>,
  { kind: 'workspace' }
>;
