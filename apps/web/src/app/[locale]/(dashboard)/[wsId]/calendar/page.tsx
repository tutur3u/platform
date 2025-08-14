import { CalendarActiveSyncDebugger } from './active-sync';
import CalendarClientPage from './client';
import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  const supabase = await createClient();

  const { data: googleToken } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', wsId)
    .maybeSingle();

  if (!workspace?.id) return null;

  return (
    <CalendarSyncProvider
      wsId={workspace.id}
      experimentalGoogleToken={googleToken}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
    >
      {DEV_MODE && <CalendarActiveSyncDebugger />}
      <CalendarClientPage
        experimentalGoogleToken={googleToken}
        workspace={workspace}
      />
    </CalendarSyncProvider>
  );
}
