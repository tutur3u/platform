import 'server-only';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Records the meeting a follow-up task came from, so the meeting record lists
 * it and the task can link back. Only a task saved into the meeting's own
 * workspace is linked; links never cross workspaces. The task already exists
 * when this runs, so a failed link is logged rather than failing the save.
 */
export async function linkSourceMeeting(
  access: {
    db: TypedSupabaseClient;
    wsId: string;
    workspaceId: string;
    meetingId: string;
    user: { id: string };
  },
  taskId: string
) {
  if (access.workspaceId !== access.wsId) return;
  try {
    const { error } = await access.db
      .schema('private')
      .from('meeting_task_links')
      .insert({
        meeting_id: access.meetingId,
        task_id: taskId,
        ws_id: access.wsId,
        link_kind: 'source',
        created_by: access.user.id,
      });
    if (error && error.code !== '23505')
      console.warn('Meet follow-up source link unavailable', error.code);
  } catch (error) {
    console.warn('Meet follow-up source link unavailable', error);
  }
}
