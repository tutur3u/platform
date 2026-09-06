import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { loadSmartSchedulingTasks } from '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks';
import { TaskCalendarPageShell } from '@tuturuuu/tasks-ui/calendar/task-calendar-page-shell';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createElement } from 'react';

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
  const user = await getSatelliteAppSessionUser('tasks');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();

  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();

  const { withoutPermission } = permissions;

  if (withoutPermission('manage_calendar')) notFound();

  const sbAdmin = await createAdminClient({ noCookie: true });

  const [googleToken, smartSchedulingTasks, connections] = await Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(sbAdmin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    loadSmartSchedulingTasks({
      resolvedWsId: workspace.id,
      userId: user.id,
    }),
    sbAdmin
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', workspace.id)
      .order('created_at', { ascending: true }),
  ]);

  const enableSmartScheduling = true;
  const isPersonalWorkspace = !!workspace.personal;

  return createElement(TaskCalendarPageShell, {
    className: 'h-[calc(100dvh-2rem)]',
    manageTaskDialog: false,
    calendarConnections: connections.data ?? [],
    enableSmartScheduling,
    experimentalGoogleToken: googleToken,
    isPersonalWorkspace,
    locale,
    smartSchedulingTasks,
    userId: user.id,
    workspace,
  });
}
