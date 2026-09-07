import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { loadSmartSchedulingTasks } from '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { CalendarWorkspacePage } from '@/components/calendar-workspace-page';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Manage Calendar in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
  searchParams: Promise<{
    date?: string | string[];
    eventId?: string | string[];
  }>;
}

function firstQueryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CalendarPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { wsId, locale } = await params;
  const deepLink = await searchParams;
  const eventId = firstQueryValue(deepLink.eventId);
  const requestedDate = firstQueryValue(deepLink.date);
  const user = await getSatelliteAppSessionUser('calendar');

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();

  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();

  const { withoutPermission } = permissions;

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}/tasks`);

  const sbAdmin = await createAdminClient({ noCookie: true });

  let initialDate = requestedDate;
  if (!initialDate && eventId) {
    const { data: linkedEvent, error: linkedEventError } = await sbAdmin
      .from('workspace_calendar_events')
      .select('start_at')
      .eq('id', eventId)
      .eq('ws_id', workspace.id)
      .maybeSingle();
    if (linkedEventError) throw linkedEventError;
    initialDate = linkedEvent?.start_at;
  }
  const parsedDate = initialDate ? new Date(initialDate) : null;
  const normalizedInitialDate =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : undefined;

  const [googleToken, smartSchedulingTasks] = await Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(sbAdmin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    loadSmartSchedulingTasks({
      resolvedWsId: workspace.id,
      userId: user.id,
    }),
  ]);

  const enableSmartScheduling = true;
  const isPersonalWorkspace = !!workspace.personal;

  return (
    <CalendarWorkspacePage
      enableSmartScheduling={enableSmartScheduling}
      experimentalGoogleToken={googleToken}
      initialDate={normalizedInitialDate}
      initialEventId={eventId}
      isPersonalWorkspace={isPersonalWorkspace}
      locale={locale}
      smartSchedulingTasks={smartSchedulingTasks}
      userId={user.id}
      workspace={workspace}
    />
  );
}
