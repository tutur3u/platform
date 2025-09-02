import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { CalendarActiveSyncDebugger } from './active-sync';
import CalendarClientPage from './client';
import TasksSidebar from './components/tasks-sidebar';

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId: id, locale } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  const { withoutPermission } = await getPermissions({ wsId });

  const supabase = await createClient();

  const { data: googleToken } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', wsId)
    .maybeSingle();

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);
  if (!workspace?.id) return null;

  return (
    <CalendarSyncProvider
      wsId={workspace.id}
      experimentalGoogleToken={googleToken}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
    >
      {DEV_MODE && <CalendarActiveSyncDebugger />}
      <div className="flex h-[calc(100%-2rem-4px)]">
        <CalendarClientPage
          experimentalGoogleToken={googleToken}
          workspace={workspace}
        />
        <TasksSidebar wsId={wsId} locale={locale} />
      </div>
    </CalendarSyncProvider>
  );
}
