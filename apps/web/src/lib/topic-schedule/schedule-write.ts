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

async function isStillEditableUnsent(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  id: string
) {
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .select('status,sent_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(
    data &&
      !data.sent_at &&
      (SCHEDULE_EDITABLE_STATUSES as readonly string[]).includes(data.status)
  );
}

async function setRecipient(
  sbAdmin: TopicAnnouncementsSupabaseClient,
  id: string,
  contactId: string | null
) {
  const { error: deleteError } = await sbAdmin
    .from('topic_announcement_recipients')
    .delete()
    .eq('announcement_id', id);
  if (deleteError) throw deleteError;
  if (!contactId) return;
  const { error: insertError } = await sbAdmin
    .from('topic_announcement_recipients')
    .insert({ announcement_id: id, contact_id: contactId });
  if (insertError) throw insertError;
}

export type ScheduleSessionUpdateResult =
  | 'locked'
  | 'recipient_conflict'
  | 'updated';

/**
 * Updates one session and replaces its GVNN when it changed. The field
 * write is conditional on the session still being editable, so a session
 * queued or sending after the save was validated is left untouched
 * (`locked`).
 *
 * The GVNN swap is two writes (no transaction without an RPC). It removes
 * the old recipient before adding the new one, so a send racing it sees
 * either the old GVNN or none (the send then refuses with NO_RECIPIENTS),
 * never both. Afterwards the session must still be editable and unsent;
 * otherwise the previous GVNN is restored and `recipient_conflict` is
 * returned so the editor reloads instead of claiming the change.
 */
export async function updateScheduleSession({
  actorUserId,
  gvnnChanged,
  id,
  normalizedWsId,
  previousGvnnContactId,
  sbAdmin,
  session,
  timeZone,
}: {
  actorUserId: string;
  gvnnChanged: boolean;
  id: string;
  normalizedWsId: string;
  previousGvnnContactId: string | null;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  session: ScheduleSessionWrite;
  timeZone: string | null;
}): Promise<ScheduleSessionUpdateResult> {
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
  if ((data ?? []).length === 0) return 'locked';
  if (!gvnnChanged) return 'updated';

  await setRecipient(sbAdmin, id, session.gvnnContactId);
  if (await isStillEditableUnsent(sbAdmin, id)) return 'updated';

  await setRecipient(sbAdmin, id, previousGvnnContactId);
  return 'recipient_conflict';
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
