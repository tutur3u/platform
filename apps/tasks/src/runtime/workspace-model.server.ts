import '@tanstack/react-start/server-only';
import {
  getSatelliteAppSessionUser,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
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

/**
 * The `[wsId]` layout's guards as data: an app session, then membership or a
 * pending invitation, then the sidebar state the shell renders with.
 */
export async function workspaceModel(id: string) {
  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');
  const workspace = await getRequestWorkspace(id, { useAdmin: true, user });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, await headers());
    if (invitation) return { kind: 'invitation' as const, invitation };
  }
  if (!workspace) notFound();
  if (!workspace.joined) redirect('/');
  const cookieStore = await cookies();
  const behavior = parseSidebarBehavior(cookieStore);
  return {
    kind: 'workspace' as const,
    workspace,
    slug: toWorkspaceSlug(workspace.id, { personal: !!workspace.personal }),
    user,
    profile: await getSatelliteCurrentUser('tasks'),
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(cookieStore),
    defaultCollapsed: getSidebarCollapsedState(cookieStore, behavior),
  };
}

export type TasksWorkspaceModel = Extract<
  Awaited<ReturnType<typeof workspaceModel>>,
  { kind: 'workspace' }
>;
