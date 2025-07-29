import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { DEV_MODE } from '@/constants/common';
import { CalendarActiveSyncDebugger } from './active-sync';
import CalendarPageClient from './calendar-page-client';
import { CalendarStateProvider } from './calendar-state-context';

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({
  params,
}: PageProps) {
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
      <CalendarStateProvider>
        {DEV_MODE && <CalendarActiveSyncDebugger />}
        <CalendarPageClient
          wsId={wsId}
          locale={locale}
          workspace={workspace}
          experimentalGoogleToken={googleToken}
        />
      </CalendarStateProvider>
    </CalendarSyncProvider>
  );
}
