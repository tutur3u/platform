import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import {
  addMinutesToScheduleTime,
  type ScheduleClass,
  type ScheduleSession,
  scheduleDateMonth,
  scheduleSlotKey,
} from '@tuturuuu/utils/topic-schedule';
import {
  loadScheduleClasses,
  loadScheduleSessions,
  SCHEDULE_LOCKED_STATUSES,
} from './schedule-data';
import {
  cancelScheduleSessions,
  insertScheduleSessions,
  type ScheduleSessionWrite,
  updateScheduleSession,
} from './schedule-write';
import type { ScheduleSaveInput, ScheduleSessionInput } from './schemas';

export type ScheduleRowErrorCode =
  | 'duplicate_slot'
  | 'ends_after_midnight'
  | 'invalid_class'
  | 'invalid_contact'
  | 'locked'
  | 'not_found'
  | 'outside_month';

export interface ScheduleRowError {
  code: ScheduleRowErrorCode;
  /** Index into `sessions`, or null for a `deleteIds` entry. */
  index: number | null;
  sessionId: string | null;
}

export type ScheduleSaveResult =
  | { ok: false; rowErrors: ScheduleRowError[] }
  | {
      createdIds: string[];
      deletedIds: string[];
      /** New rows whose slot already existed (a retried save): not re-created. */
      existingIds: string[];
      ok: true;
      updatedIds: string[];
    };

interface ScheduleSaveContext {
  actorUserId: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  timeZone: string | null;
}

async function loadActiveContactIds(
  { normalizedWsId, sbAdmin }: ScheduleSaveContext,
  ids: string[]
) {
  if (ids.length === 0) return new Set<string>();
  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .in('id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}

function toWrite(
  input: ScheduleSessionInput,
  scheduleClass: ScheduleClass,
  endTime: string,
  teacherWorkspaceUserId: string | null
): ScheduleSessionWrite {
  return {
    classLabel: scheduleClass.name,
    endTime,
    groupId: input.groupId,
    gvnnContactId: input.gvnnContactId,
    place: input.place ?? null,
    room: input.room ?? null,
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    teacherWorkspaceUserId,
  };
}

function isUnchanged(existing: ScheduleSession, next: ScheduleSessionWrite) {
  return (
    existing.groupId === next.groupId &&
    existing.sessionDate === next.sessionDate &&
    existing.startTime === next.startTime &&
    existing.endTime === next.endTime &&
    (existing.room ?? null) === next.room &&
    (existing.place ?? null) === next.place &&
    existing.gvnnContactId === next.gvnnContactId &&
    existing.teacherWorkspaceUserId === next.teacherWorkspaceUserId
  );
}

/**
 * Saves one month of editor changes. Everything is validated before any
 * write, so a rejected save changes nothing. The GVCN is never taken from
 * the client: a new session or a class change gets the class's current
 * GVCN; an edit within the same class keeps the assigned teacher (who may
 * already be writing the topic) and only fills it when it was empty.
 */
export async function saveScheduleMonth(
  context: ScheduleSaveContext,
  input: ScheduleSaveInput
): Promise<ScheduleSaveResult> {
  const { month } = input;
  const [classes, existing] = await Promise.all([
    loadScheduleClasses(context),
    loadScheduleSessions({ ...context, month }),
  ]);
  const classById = new Map(classes.map((item) => [item.id, item]));
  const existingById = new Map(
    existing.map((session) => [session.id, session])
  );
  const contactIds = await loadActiveContactIds(context, [
    ...new Set(input.sessions.flatMap((row) => row.gvnnContactId ?? [])),
  ]);

  const rowErrors: ScheduleRowError[] = [];
  const fail = (
    code: ScheduleRowErrorCode,
    index: number | null,
    sessionId: string | null = null
  ) => rowErrors.push({ code, index, sessionId });

  for (const id of input.deleteIds) {
    const session = existingById.get(id);
    if (!session) fail('not_found', null, id);
    else if (SCHEDULE_LOCKED_STATUSES.has(session.status)) {
      fail('locked', null, id);
    }
  }

  const editedIds = new Set(input.sessions.flatMap((row) => row.id ?? []));
  const removedIds = new Set([...input.deleteIds, ...editedIds]);
  // Slots held after the save by sessions this request does not touch.
  const untouchedSlots = new Map(
    existing
      .filter((session) => !removedIds.has(session.id))
      .map((session) => [scheduleSlotKey(session), session.id])
  );
  const claimedSlots = new Set<string>();

  const updates: { id: string; write: ScheduleSessionWrite }[] = [];
  const inserts: ScheduleSessionWrite[] = [];
  const existingIds: string[] = [];

  input.sessions.forEach((row, index) => {
    const errorCount = rowErrors.length;
    const current = row.id ? existingById.get(row.id) : undefined;
    const scheduleClass = classById.get(row.groupId);
    const endTime = addMinutesToScheduleTime(
      row.startTime,
      row.durationMinutes
    );

    if (row.id && !current) fail('not_found', index, row.id);
    if (current && SCHEDULE_LOCKED_STATUSES.has(current.status)) {
      fail('locked', index, row.id);
    }
    if (scheduleDateMonth(row.sessionDate) !== month) {
      fail('outside_month', index, row.id ?? null);
    }
    if (!scheduleClass) fail('invalid_class', index, row.id ?? null);
    if (row.gvnnContactId && !contactIds.has(row.gvnnContactId)) {
      fail('invalid_contact', index, row.id ?? null);
    }
    if (!endTime) fail('ends_after_midnight', index, row.id ?? null);
    if (rowErrors.length > errorCount || !scheduleClass || !endTime) return;

    const key = scheduleSlotKey(row);
    const holder = untouchedSlots.get(key);
    if (!current && holder) {
      // Same class, date and start already saved: a retried request.
      existingIds.push(holder);
      return;
    }
    if (holder || claimedSlots.has(key)) {
      fail('duplicate_slot', index, row.id ?? null);
      return;
    }
    claimedSlots.add(key);

    const sameClass = current?.groupId === row.groupId;
    const teacher =
      (sameClass ? current?.teacherWorkspaceUserId : null) ??
      scheduleClass.primaryTeacherId;
    const write = toWrite(row, scheduleClass, endTime, teacher);
    if (!current) inserts.push(write);
    else if (!isUnchanged(current, write))
      updates.push({ id: current.id, write });
  });

  if (rowErrors.length > 0) return { ok: false, rowErrors };

  await cancelScheduleSessions({ ...context, ids: input.deleteIds });
  for (const update of updates) {
    await updateScheduleSession({
      ...context,
      gvnnChanged:
        existingById.get(update.id)?.gvnnContactId !==
        update.write.gvnnContactId,
      id: update.id,
      session: update.write,
    });
  }
  const createdIds = await insertScheduleSessions({
    ...context,
    sessions: inserts,
    sourceName: `schedule ${month}`,
  });

  return {
    createdIds,
    deletedIds: [...input.deleteIds],
    existingIds,
    ok: true,
    updatedIds: updates.map((update) => update.id),
  };
}
