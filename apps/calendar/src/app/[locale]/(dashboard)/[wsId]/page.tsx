import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import { loadSmartSchedulingTasks } from '@tuturuuu/ui/calendar-app/components/load-smart-scheduling-tasks';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Manage Calendar in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  await connection();

  const { wsId, locale } = await params;
  const user = await getSatelliteAppSessionUser('calendar');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();

  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();

  const { withoutPermission } = permissions;

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

  const sbAdmin = await createAdminClient({ noCookie: true });

  const [googleToken, { data: calendarConnections }, smartSchedulingTasks] =
    await Promise.all([
      fetchUserWorkspaceCalendarGoogleTokenForClient(sbAdmin, {
        wsId: workspace.id,
        userId: user.id,
      }),
      sbAdmin
        .from('calendar_connections')
        .select('*')
        .eq('ws_id', workspace.id)
        .order('created_at', { ascending: true }),
      loadSmartSchedulingTasks({
        resolvedWsId: workspace.id,
        userId: user.id,
      }),
    ]);

  const enableSmartScheduling = true;
  const isPersonalWorkspace = workspace.id === user?.id;

  return (
    <CalendarPageShell
      calendarConnections={calendarConnections || []}
      enableSmartScheduling={enableSmartScheduling}
      experimentalGoogleToken={googleToken}
      isPersonalWorkspace={isPersonalWorkspace}
      locale={locale}
      smartSchedulingTasks={smartSchedulingTasks}
      userId={user.id}
      workspace={workspace}
    />
  );
}
