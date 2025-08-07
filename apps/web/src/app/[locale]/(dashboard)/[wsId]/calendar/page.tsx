import { CalendarActiveSyncDebugger } from './active-sync';
import CalendarPageClient from './calendar-page-client';
import { CalendarStateProvider } from './calendar-state-context';
import { DEV_MODE } from '@/constants/common';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { CalendarSyncWrapper } from './calendar-sync-wrapper';

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
    <CalendarSyncWrapper wsId={workspace.id} googleToken={googleToken}>
      <CalendarStateProvider>
        {DEV_MODE && <CalendarActiveSyncDebugger />}
        <CalendarPageClient
          wsId={wsId}
          locale={locale}
          workspace={workspace}
          experimentalGoogleToken={googleToken}
        />
      </CalendarStateProvider>
    </CalendarSyncWrapper>
  );
}
