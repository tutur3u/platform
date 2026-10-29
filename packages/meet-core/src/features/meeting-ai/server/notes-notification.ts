import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export const NOTES_READY_CODE = 'meeting_notes_ready';
export const NOTES_READY_MAX_RECIPIENTS = 128;

/**
 * A link only. Neither the transcript nor any generated text may appear here;
 * recipients read the notes through the meeting page, which checks access.
 */
export function notesReadyNotification(input: {
  wsId: string;
  meetingId: string;
  sessionId: string;
}) {
  return {
    p_ws_id: input.wsId,
    p_type: 'system_announcement',
    p_code: NOTES_READY_CODE,
    p_title: 'Meeting notes are ready / Ghi chú cuộc họp đã sẵn sàng',
    p_description:
      'Open the meeting to read them. / Mở cuộc họp để xem ghi chú.',
    p_data: {
      kind: NOTES_READY_CODE,
      href: `/${input.wsId}/meetings/${input.meetingId}`,
      meetingId: input.meetingId,
      sessionId: input.sessionId,
    },
    p_entity_type: 'meeting_notes',
    p_entity_id: input.sessionId,
    p_scope: 'workspace' as const,
    p_priority: 'medium' as const,
  };
}

/** Best effort: the notes are already saved, so a failure here only logs. */
export async function notifyNotesReady(
  db: TypedSupabaseClient,
  input: {
    wsId: string;
    meetingId: string;
    sessionId: string;
    hostId: string;
    readerIds: readonly string[];
  }
) {
  const candidates = [...new Set([input.hostId, ...input.readerIds])].slice(
    0,
    NOTES_READY_MAX_RECIPIENTS
  );
  const members = await db
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', input.wsId)
    .in('user_id', candidates);
  if (members.error) {
    console.error('Meeting notes notification recipients unavailable');
    return 0;
  }
  const recipients = new Set(members.data.map((member) => member.user_id));
  let sent = 0;
  for (const userId of candidates) {
    if (!recipients.has(userId)) continue;
    const { error } = await db.rpc('create_notification', {
      ...notesReadyNotification(input),
      p_user_id: userId,
    });
    if (error) console.error('Meeting notes notification failed');
    else sent++;
  }
  return sent;
}
