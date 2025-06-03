import CalendarClientPage from './client';
import TasksSidebar from './components/tasks-sidebar';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { createClient } from '@ncthub/supabase/next/server';
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
    <div className="flex h-[calc(100%-2rem-4px)]">
      <CalendarClientPage
        experimentalGoogleToken={googleToken || undefined}
        workspace={workspace}
      />
      <TasksSidebar wsId={wsId} locale={locale} />
    </div>
  );
}
