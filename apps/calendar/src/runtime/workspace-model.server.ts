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
  const admin = await createAdminClient({ noCookie: true });
  const { data: calendarConnections } = await admin
    .from('calendar_connections')
    .select('*')
    .eq('ws_id', workspace.id)
    .order('created_at', { ascending: true });
  return {
    kind: 'workspace' as const,
    workspace,
    user: { id: user.id },
    profile: await getSatelliteCurrentUser('calendar'),
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
