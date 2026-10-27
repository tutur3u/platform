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

/** Fields a conflicting save may still have changed on a session. */
export type ScheduleSessionPartialField = 'gvnn';

export type ScheduleSessionUpdateResult =
  /** Fields and GVNN saved. */
  | { kind: 'updated' }
  /** The session was already in delivery: nothing was changed. */
  | { kind: 'locked' }
  /**
   * The session entered delivery while the GVNN was being swapped: only the
   * GVNN changed, and a send may have used either GVNN. Nothing is restored,
   * because a send may already have read the recipients.
   */
  | { fields: ScheduleSessionPartialField[]; kind: 'partial' };

async function updateFieldsIfEditable({
  actorUserId,
  id,
  normalizedWsId,
  sbAdmin,
  session,
  timeZone,
}: {
  actorUserId: string;
  id: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  session: ScheduleSessionWrite;
  timeZone: string | null;
}) {
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
  return (data ?? []).length > 0;
}

/**
 * Updates one session and, when it changed, its GVNN. Every write happens
 * only while the session is still editable, and a send now claims a session
 * (editable to processing) before it reads the recipients, so the order is:
 *
 * 1. re-check the session is editable and unsent, else `locked` (nothing
 *    changed);
 * 2. swap the GVNN: remove the old recipient, then add the new one, so a send
 *    racing it sees the old GVNN or none (and refuses with NO_RECIPIENTS),
 *    never both;
 * 3. write the fields, conditional on the session still being editable.
 *
 * If step 3 finds the session claimed, a send started during the swap: the
 * fields stay as they were and the result is `partial` (only the GVNN
 * changed). Nothing is restored then, since that send may have read either
 * recipient. If the swap itself fails, the previous GVNN is put back while
 * the session is still editable.
 */
export async function updateScheduleSession({
  gvnnChanged,
  id,
  previousGvnnContactId,
  sbAdmin,
  session,
  ...context
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
  const writeFields = () =>
    updateFieldsIfEditable({ ...context, id, sbAdmin, session });

  if (!gvnnChanged) {
    return (await writeFields()) ? { kind: 'updated' } : { kind: 'locked' };
  }

  if (!(await isStillEditableUnsent(sbAdmin, id))) return { kind: 'locked' };
  try {
    await setRecipient(sbAdmin, id, session.gvnnContactId);
  } catch (error) {
    if (await isStillEditableUnsent(sbAdmin, id)) {
      await setRecipient(sbAdmin, id, previousGvnnContactId);
    }
    throw error;
  }

  return (await writeFields())
    ? { kind: 'updated' }
    : { fields: ['gvnn'], kind: 'partial' };
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
