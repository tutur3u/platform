import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import { loadSmartSchedulingTasks } from '@tuturuuu/ui/calendar-app/components/load-smart-scheduling-tasks';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Manage Calendar in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId, locale } = await params;
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId);
  if (!workspace) notFound();

  const permissions = await getPermissions({ wsId: workspace.id });
  if (!permissions) notFound();

  if (permissions.withoutPermission('manage_calendar')) {
    redirect(`/${wsId}`);
  }

  const sbAdmin = await createAdminClient({ noCookie: true });

  const [googleToken, { data: calendarConnections }, smartSchedulingTasks] =
    await Promise.all([
      fetchUserWorkspaceCalendarGoogleTokenForClient(supabase, {
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

  return (
    <CalendarPageShell
      calendarConnections={calendarConnections || []}
      enableSmartScheduling
      experimentalGoogleToken={googleToken}
      isPersonalWorkspace={workspace.id === user.id}
      locale={locale}
      smartSchedulingTasks={smartSchedulingTasks}
      userId={user.id}
      workspace={workspace}
    />
  );
}
