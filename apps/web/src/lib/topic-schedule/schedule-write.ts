import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import { computeTopicAnnouncementSendDueAt } from '@tuturuuu/utils/topic-announcement-deadline';
import {
  SCHEDULE_EDITABLE_STATUSES,
  SCHEDULE_SOURCE_TYPE,
} from './schedule-data';

/** Session fields written by the editor and the month clone. */
export interface ScheduleSessionWrite {
  classLabel: string;
  endTime: string;
  groupId: string;
  gvnnContactId: string | null;
  place: string | null;
  room: string | null;
  sessionDate: string;
  startTime: string;
  teacherWorkspaceUserId: string | null;
}

export function scheduleSessionTitle(session: {
  classLabel: string;
  sessionDate: string;
  startTime: string;
}) {
  return `${session.classLabel} ${session.sessionDate} ${session.startTime}`
    .trim()
    .slice(0, 120);
}

function sessionColumns(
  session: ScheduleSessionWrite,
  timeZone: string | null
) {
  return {
    class_label: session.classLabel,
    end_time: `${session.endTime}:00`,
    group_id: session.groupId,
    place: session.place,
    room: session.room,
    // 24h before the session in the workspace timezone (P2 rule).
    send_due_at: computeTopicAnnouncementSendDueAt({
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      timeZone,
    }),
    session_date: session.sessionDate,
    start_time: `${session.startTime}:00`,
    teacher_workspace_user_id: session.teacherWorkspaceUserId,
    title: scheduleSessionTitle(session),
  };
}

/** Inserts sessions as topic-less drafts in one batch, plus their GVNN. */
export async function insertScheduleSessions({
  actorUserId,
  normalizedWsId,
  sbAdmin,
  sessions,
  sourceName,
  timeZone,
}: {
  actorUserId: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  sessions: readonly ScheduleSessionWrite[];
  sourceName: string;
  timeZone: string | null;
}): Promise<string[]> {
  if (sessions.length === 0) return [];

  const { data: batch, error: batchError } = await sbAdmin
    .from('topic_announcement_batches')
    .insert({
      created_by: actorUserId,
      row_count: sessions.length,
      source_name: sourceName,
      source_type: SCHEDULE_SOURCE_TYPE,
      ws_id: normalizedWsId,
    })
    .select('id')
    .single();
  if (batchError) throw batchError;

  const { data: inserted, error } = await sbAdmin
    .from('topic_announcements')
    .insert(
      sessions.map((session, index) => ({
        ...sessionColumns(session, timeZone),
        batch_id: batch.id,
        body: '',
        created_by: actorUserId,
        source_row_number: index + 1,
        source_type: SCHEDULE_SOURCE_TYPE,
        status: 'draft',
        topic: null,
        updated_by: actorUserId,
        ws_id: normalizedWsId,
      }))
    )
    .select('id,source_row_number');
  if (error) throw error;

  const idByRow = new Map<number, string>(
    (inserted ?? []).map((row: { id: string; source_row_number: number }) => [
      row.source_row_number,
      row.id,
    ])
  );
  const recipients = sessions.flatMap((session, index) => {
    const announcementId = idByRow.get(index + 1);
    return announcementId && session.gvnnContactId
      ? [{ announcement_id: announcementId, contact_id: session.gvnnContactId }]
      : [];
  });
  if (recipients.length > 0) {
    const { error: recipientsError } = await sbAdmin
      .from('topic_announcement_recipients')
      .insert(recipients);
    if (recipientsError) throw recipientsError;
  }

  return sessions.flatMap((_, index) => idByRow.get(index + 1) ?? []);
}

/**
 * Updates one session and replaces its GVNN when it changed. The write is
 * conditional on the session still being editable, so a session that was
 * queued or started sending after the save was validated is left untouched
 * (returns false) instead of being rewritten or losing its recipient.
 */
export async function updateScheduleSession({
  actorUserId,
  gvnnChanged,
  id,
  normalizedWsId,
  sbAdmin,
  session,
  timeZone,
}: {
  actorUserId: string;
  gvnnChanged: boolean;
  id: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  session: ScheduleSessionWrite;
  timeZone: string | null;
}): Promise<boolean> {
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      ...sessionColumns(session, timeZone),
      updated_at: new Date().toISOString(),
      updated_by: actorUserId,
    })
    .eq('id', id)
    .eq('ws_id', normalizedWsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .in('status', [...SCHEDULE_EDITABLE_STATUSES])
    .select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) return false;
  if (!gvnnChanged) return true;

  const { error: deleteError } = await sbAdmin
    .from('topic_announcement_recipients')
    .delete()
    .eq('announcement_id', id);
  if (deleteError) throw deleteError;
  if (!session.gvnnContactId) return true;

  const { error: insertError } = await sbAdmin
    .from('topic_announcement_recipients')
    .insert({ announcement_id: id, contact_id: session.gvnnContactId });
  if (insertError) throw insertError;
  return true;
}

/**
 * Removes sessions the way announcements are removed elsewhere: they become
 * `cancelled`, keeping any topic, attachments and audit trail, and drop out
 * of the schedule and later payroll counts. Only still-editable sessions are
 * cancelled; returns the ids that were.
 */
export async function cancelScheduleSessions({
  actorUserId,
  ids,
  normalizedWsId,
  sbAdmin,
}: {
  actorUserId: string;
  ids: readonly string[];
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .update({
      last_error: null,
      scheduled_send_at: null,
      status: 'cancelled',
      updated_by: actorUserId,
    })
    .eq('ws_id', normalizedWsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .in('status', [...SCHEDULE_EDITABLE_STATUSES])
    .in('id', [...ids])
    .select('id');
  if (error) throw error;
  return (data ?? []).map((row: { id: string }) => row.id);
}
