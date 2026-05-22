import { getAppSessionUserFromRequest } from '@tuturuuu/auth/app-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { CalendarPageShell } from '@tuturuuu/ui/calendar-app/calendar-page-shell';
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

  const supabase = await createAdminClient({ noCookie: true });

  // Fetch Google auth token, calendar connections, and user email in parallel for better performance
  const [{ data: googleToken }, { data: calendarConnections }] = user?.id
    ? await Promise.all([
        supabase
          .from('calendar_auth_tokens')
          .select('*')
          .eq('ws_id', workspace.id)
          .maybeSingle(),
        supabase
          .from('calendar_connections')
          .select('*')
          .eq('ws_id', workspace.id)
          .order('created_at', { ascending: true }),
      ])
    : [
        {
          data: null,
        },
        {
          data: null,
        },
        [],
      ];

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

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
