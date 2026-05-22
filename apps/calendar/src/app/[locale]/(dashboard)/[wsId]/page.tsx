import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
import { fetchUserWorkspaceCalendarGoogleTokenForClient } from '@tuturuuu/utils/calendar-auth-token';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
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
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId, locale } = await params;
  const requestHeaders = await headers();
  const user = getAppSessionUserFromRequest(
    { headers: requestHeaders },
    { targetApp: 'calendar' }
  );

  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(wsId, { useAdmin: true, user });
  if (!workspace) notFound();

  const permissions = await getPermissions({ user, wsId });
  if (!permissions) notFound();

  const { withoutPermission } = permissions;

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

  const sbAdmin = await createAdminClient({ noCookie: true });

  const [googleToken, { data: calendarConnections }] = await Promise.all([
    fetchUserWorkspaceCalendarGoogleTokenForClient(sbAdmin, {
      wsId: workspace.id,
      userId: user.id,
    }),
    sbAdmin
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', workspace.id)
      .order('created_at', { ascending: true }),
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
      userId={user.id}
      workspace={workspace}
    />
  );
}
