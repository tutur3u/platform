import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { loadSmartSchedulingTasks } from '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getRequestWorkspace as getWorkspace } from '@tuturuuu/utils/request-workspace';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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

// Date-only links identify a Gregorian calendar day, independent of server timezone.
function navigationDateValue(value?: string) {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
      ? value
      : undefined;
  }
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : undefined;
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

  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions) notFound();

  const { withoutPermission } = permissions;

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}/tasks`);

  const sbAdmin = await createAdminClient({ noCookie: true });

  // Start independent reads after permission verification. Capture failures now
  // so a linked-event lookup error remains authoritative without an unhandled
  // rejection from the background reads.
  const calendarDataPromise = Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(sbAdmin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    loadSmartSchedulingTasks({
      resolvedWsId: workspace.id,
      userId: user.id,
    }),
  ]).then(
    (data) => ({ data }),
    (error: unknown) => ({ error })
  );

  let initialDate = navigationDateValue(requestedDate);
  if (!initialDate && eventId) {
    const { data: linkedEvent, error: linkedEventError } = await sbAdmin
      .from('workspace_calendar_events')
      .select('start_at')
      .eq('id', eventId)
      .eq('ws_id', workspace.id)
      .maybeSingle();
    if (linkedEventError) throw linkedEventError;
    // Stored event start_at is an instant, even when navigation has a date-only contract.
    const eventStart = linkedEvent?.start_at
      ? new Date(linkedEvent.start_at)
      : null;
    initialDate =
      eventStart && Number.isFinite(eventStart.getTime())
        ? eventStart.toISOString()
        : undefined;
  }
  const calendarData = await calendarDataPromise;
  if ('error' in calendarData) throw calendarData.error;
  const [googleToken, smartSchedulingTasks] = calendarData.data;

  const enableSmartScheduling = true;
  const isPersonalWorkspace = !!workspace.personal;

  return (
    <CalendarWorkspacePage
      enableSmartScheduling={enableSmartScheduling}
      experimentalGoogleToken={googleToken}
      initialDate={initialDate}
      initialEventId={eventId}
      isPersonalWorkspace={isPersonalWorkspace}
      locale={locale}
      smartSchedulingTasks={smartSchedulingTasks}
      userId={user.id}
      workspace={workspace}
    />
  );
}
