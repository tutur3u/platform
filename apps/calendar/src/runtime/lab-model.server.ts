import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from './next-navigation';
export async function labModel(wsId: string) {
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user?.id) redirect('/login');
  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();
  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();
  if (
    !isVerifiedTuturuuuStaffSession(
      user &&
        (await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        ))
    ) ||
    permissions.withoutPermission('manage_calendar')
  )
    redirect(`/${wsId}`);
  const admin = await createAdminClient({ noCookie: true });
  const [googleToken, { data: calendarConnections }] = await Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(admin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    admin
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', workspace.id)
      .order('created_at', { ascending: true }),
  ]);
  return {
    workspace,
    googleToken,
    calendarConnections: calendarConnections || [],
    personal: workspace.id === user.id,
  };
}
