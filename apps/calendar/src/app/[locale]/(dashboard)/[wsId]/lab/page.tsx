import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import CalendarLabClientPage from './client';

export const metadata: Metadata = {
  title: 'Calendar Lab',
  description: 'Smart Scheduling Algorithm Visualization & Debugging Lab.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarLabPage({ params }: PageProps) {
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);
  const { withoutPermission } = await getPermissions({ wsId });

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Security Check: Only Tuturuuu employees
  const isEmployee = user?.email?.endsWith('@tuturuuu.com');

  if (!isEmployee) {
    redirect(`/${wsId}`);
  }

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

  // Fetch Google auth token and calendar connections for "Real Data Import" feature
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
    : [{ data: null }, { data: null }];

  const isPersonalWorkspace = workspace.id === user?.id;

  return (
    <TaskDialogWrapper
      isPersonalWorkspace={isPersonalWorkspace}
      wsId={workspace.id}
    >
      <CalendarSyncProvider
        wsId={workspace.id}
        experimentalGoogleToken={googleToken}
        initialCalendarConnections={calendarConnections || []}
      >
        <div className="flex h-[calc(100vh-2rem)] w-full flex-col">
          <CalendarLabClientPage
            workspace={workspace}
            googleToken={googleToken}
            calendarConnections={calendarConnections || []}
          />
        </div>
      </CalendarSyncProvider>
    </TaskDialogWrapper>
  );
}
