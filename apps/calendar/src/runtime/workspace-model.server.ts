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
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getRequestWorkspace } from '@tuturuuu/utils/request-workspace';
import { notFound, redirect } from './next-navigation';
import { cookies, headers } from './request-context';

export async function workspaceModel(id: string) {
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user?.id) redirect('/login');
  const workspace = await getRequestWorkspace(id, { useAdmin: true, user });
  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, await headers());
    if (invitation) return { kind: 'invitation' as const, invitation };
  }
  if (!workspace) notFound();
  if (!workspace.joined) redirect('/');
  return { kind: 'workspace' as const, workspace, user: { id: user.id } };
}

export async function workspaceShellModel(
  scope: Extract<
    Awaited<ReturnType<typeof workspaceModel>>,
    { kind: 'workspace' }
  >
) {
  const { workspace, user } = scope;
  const cookieStore = await cookies();
  const behavior = parseSidebarBehavior(cookieStore);
  // The profile lookup and the connection read do not depend on each other.
  const [{ data: calendarConnections }, profile] = await Promise.all([
    (async () => {
      const admin = await createAdminClient({ noCookie: true });
      return admin
        .from('calendar_connections')
        .select('*')
        .eq('ws_id', workspace.id)
        .order('created_at', { ascending: true });
    })(),
    getSatelliteCurrentUser('calendar'),
  ]);
  return {
    kind: 'workspace' as const,
    workspace,
    user: { id: user.id },
    profile,
    behavior,
    behaviorUpdatedAt: getSidebarBehaviorUpdatedAt(cookieStore),
    defaultCollapsed: getSidebarCollapsedState(cookieStore, behavior),
    calendarConnections: calendarConnections || [],
  };
}
export type CalendarWorkspaceModel = Extract<
  Awaited<ReturnType<typeof workspaceShellModel>>,
  { kind: 'workspace' }
>;
