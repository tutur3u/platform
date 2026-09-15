import 'server-only';
import { encryptEventFieldsForTools } from '@tuturuuu/ai/tools/executors/helpers/encryption';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { buildFollowupPayload } from '../followup-save';
import { MeetAiError } from './access';

/** Resolve and encrypt before claiming a write receipt; insert into the reviewed native destination. */
export async function prepareCalendarFollowup(
  db: TypedSupabaseClient,
  workspaceId: string,
  payload: Extract<
    ReturnType<typeof buildFollowupPayload>,
    { start_at: string }
  >
) {
  const { data: calendar, error } = await db
    .schema('private')
    .from('workspace_calendars')
    .select('id')
    .eq('ws_id', workspaceId)
    .eq('calendar_type', 'primary')
    .eq('is_enabled', true)
    .maybeSingle();
  if (error || !calendar)
    throw new MeetAiError(503, 'Workspace primary calendar is unavailable');
  const encrypted = await encryptEventFieldsForTools(
    { title: payload.title, description: payload.description, location: null },
    workspaceId
  );
  return async () => {
    const { data: event, error: insertError } = await db
      .from('workspace_calendar_events')
      .insert({
        ...encrypted,
        ws_id: workspaceId,
        source_calendar_id: calendar.id,
        start_at: payload.start_at,
        end_at: payload.end_at,
      })
      .select('id')
      .single();
    if (insertError || !event) {
      const rejected =
        /^(22|23)/.test(insertError?.code ?? '') ||
        insertError?.code === '42501';
      return {
        error: 'Calendar save could not be confirmed',
        ...(rejected ? { created: false } : {}),
      };
    }
    return { success: true, event };
  };
}
