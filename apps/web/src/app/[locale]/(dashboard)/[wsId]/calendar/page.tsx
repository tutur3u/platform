import { CalendarActiveSyncDebugger } from './active-sync';
import CalendarClientPage from './client';
import TasksSidebar from './components/tasks-sidebar';
import { DEV_MODE } from '@/constants/common';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId, locale } = await params;
  const workspace = await getWorkspace(wsId);

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const supabase = await createClient();

  const { data: googleToken } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', wsId)
    .maybeSingle();

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);
  if (!workspace) return null;

  return (
    <CalendarSyncProvider
      wsId={workspace?.id || ''}
      experimentalGoogleToken={googleToken || undefined}
      useQuery={useQuery}
    >
      {DEV_MODE && <CalendarActiveSyncDebugger wsId={wsId} />}
      <div className="flex h-[calc(100%-2rem-4px)]">
        <CalendarClientPage
          experimentalGoogleToken={googleToken || undefined}
          workspace={workspace}
        />
        <TasksSidebar wsId={wsId} locale={locale} />
      </div>
    </CalendarSyncProvider>
  );
}
