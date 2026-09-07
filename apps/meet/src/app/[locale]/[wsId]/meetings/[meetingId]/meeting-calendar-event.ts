import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { getPermissions } from '@tuturuuu/utils/workspace-helper';

interface LoadMeetingCalendarEventOptions {
  supabase: TypedSupabaseClient;
  permissions: Awaited<ReturnType<typeof getPermissions>>;
  wsId: string;
  meetingId: string;
}

export async function loadMeetingCalendarEvent({
  supabase,
  permissions,
  wsId,
  meetingId,
}: LoadMeetingCalendarEventOptions) {
  if (!permissions || permissions.withoutPermission('manage_calendar')) {
    return null;
  }

  const { data } = await supabase
    .from('workspace_calendar_events')
    .select('id, start_at')
    .eq('ws_id', wsId)
    .eq('scheduling_metadata->>type', 'tuturuuu_meeting')
    .eq('scheduling_metadata->>meeting_id', meetingId)
    .maybeSingle();

  return data;
}
