import CalendarClientPage from './client';
import TasksSidebar from './components/tasks-sidebar';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  if (!workspace?.id) return null;

  return (
    <CalendarSyncProvider
      wsId={workspace.id}
      experimentalGoogleToken={googleToken}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
    >
      <div className="flex h-[calc(100vh-4.75rem)] md:h-[calc(100vh-2rem)]">
        <div className="flex-1">
          <CalendarClientPage
            experimentalGoogleToken={googleToken}
            workspace={workspace}
          />
          <TasksSidebar wsId={wsId} locale={locale} />
        </div>
      </div>
    </CalendarSyncProvider>
  );
}
