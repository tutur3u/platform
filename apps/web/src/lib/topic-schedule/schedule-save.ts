import type { TopicAnnouncementsSupabaseClient } from '@tuturuuu/users-core/routes/topic-announcements';
import {
  addMinutesToScheduleTime,
  type ScheduleClass,
  type ScheduleSession,
  scheduleDateMonth,
  scheduleSlotKey,
} from '@tuturuuu/utils/topic-schedule';
import {
  isScheduleSessionEditable,
  loadScheduleClasses,
  loadScheduleSessions,
  SCHEDULE_SOURCE_TYPE,
} from './schedule-data';
import {
  cancelScheduleSessions,
  insertScheduleSessions,
  type ScheduleSessionPartialField,
  type ScheduleSessionWrite,
  updateScheduleSession,
} from './schedule-write';
import type { ScheduleSaveInput, ScheduleSessionInput } from './schemas';

export type ScheduleRowErrorCode =
  | 'duplicate_slot'
  | 'partially_applied'
  | 'ends_after_midnight'
  | 'invalid_class'
  | 'invalid_contact'
  | 'locked'
  | 'not_found'
  | 'outside_month';

export interface ScheduleRowError {
  code: ScheduleRowErrorCode;
  /** For `partially_applied`: what did change (the rest did not). */
  fields?: ScheduleSessionPartialField[];
  /** Index into `sessions`, or null for a `deleteIds` entry. */
  index: number | null;
  sessionId: string | null;
}

export interface ScheduleSaveSummary {
  createdIds: string[];
  deletedIds: string[];
  /** New rows already saved identically (a retried save): not re-created. */
  existingIds: string[];
  updatedIds: string[];
  /**
   * Sessions this request created or moved to another teacher: the only ones
   * whose GVCN should hear about it. A retried or unchanged save has none.
   */
  assignedIds: string[];
}

export type ScheduleSaveResult =
  | ({ ok: true } & ScheduleSaveSummary)
  /** Validation failed; nothing was written. */
  | { conflict: false; ok: false; rowErrors: ScheduleRowError[] }
  /** Some sessions entered delivery mid-save; the rest were saved. */
  | {
      conflict: true;
      ok: false;
      rowErrors: ScheduleRowError[];
      saved: ScheduleSaveSummary;
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

/** A saved session with the same slot and the same editor fields. */
function hasSameContent(existing: ScheduleSession, next: ScheduleSessionWrite) {
  return (
    existing.endTime === next.endTime &&
    (existing.room ?? null) === next.room &&
    (existing.place ?? null) === next.place &&
    existing.gvnnContactId === next.gvnnContactId
  );
}

/** Deleted ids this workspace already cancelled (a retried removal). */
async function loadAlreadyCancelledIds(
  { normalizedWsId, sbAdmin }: ScheduleSaveContext,
  ids: string[]
) {
  if (ids.length === 0) return new Set<string>();
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .select('id')
    .eq('ws_id', normalizedWsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE)
    .eq('status', 'cancelled')
    .in('id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}

/**
 * Saves one month of editor changes. Everything is validated before any
 * write, so a rejected save changes nothing; each write then re-checks that
 * its session is still editable, and a session that entered delivery in the
 * meantime is reported as a `locked` conflict instead of being changed.
 *
 * Retries are safe: removing an already-removed session succeeds, and a new
 * row whose slot already holds an identical session is reported in
 * `existingIds` rather than created twice. A different session in that slot
 * is a `duplicate_slot` row error.
 *
 * The GVCN is never taken from the client: a new session or a class change
 * gets the class's current GVCN; an edit within the same class keeps the
 * assigned teacher (who may already be writing the topic) and only fills it
 * when it was empty.
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
  const [contactIds, alreadyCancelled] = await Promise.all([
    loadActiveContactIds(context, [
      ...new Set(input.sessions.flatMap((row) => row.gvnnContactId ?? [])),
    ]),
    loadAlreadyCancelledIds(
      context,
      input.deleteIds.filter((id) => !existingById.has(id))
    ),
  ]);

  const rowErrors: ScheduleRowError[] = [];
  const fail = (
    code: ScheduleRowErrorCode,
    index: number | null,
    sessionId: string | null = null
  ) => rowErrors.push({ code, index, sessionId });

  const cancelIds: string[] = [];
  for (const id of input.deleteIds) {
    const session = existingById.get(id);
    if (session && !isScheduleSessionEditable(session.status)) {
      fail('locked', null, id);
    } else if (session) cancelIds.push(id);
    else if (!alreadyCancelled.has(id)) fail('not_found', null, id);
  }

  const editedIds = new Set(input.sessions.flatMap((row) => row.id ?? []));
  const removedIds = new Set([...input.deleteIds, ...editedIds]);
  // Sessions this request does not touch, by slot.
  const untouchedSlots = new Map(
    existing
      .filter((session) => !removedIds.has(session.id))
      .map((session) => [scheduleSlotKey(session), session])
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
    if (current && !isScheduleSessionEditable(current.status)) {
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

    const sameClass = current?.groupId === row.groupId;
    const teacher =
      (sameClass ? current?.teacherWorkspaceUserId : null) ??
      scheduleClass.primaryTeacherId;
    const write = toWrite(row, scheduleClass, endTime, teacher);

    const key = scheduleSlotKey(row);
    const holder = untouchedSlots.get(key);
    if (!current && holder && hasSameContent(holder, write)) {
      // The identical session is already saved: a retried request.
      existingIds.push(holder.id);
      return;
    }
    if (holder || claimedSlots.has(key)) {
      fail('duplicate_slot', index, row.id ?? null);
      return;
    }
    claimedSlots.add(key);

    if (!current) inserts.push(write);
    else if (!isUnchanged(current, write))
      updates.push({ id: current.id, write });
  });

  if (rowErrors.length > 0) return { conflict: false, ok: false, rowErrors };

  const cancelled = new Set(
    await cancelScheduleSessions({ ...context, ids: cancelIds })
  );
  const conflicts: ScheduleRowError[] = cancelIds
    .filter((id) => !cancelled.has(id))
    .map((id) => ({ code: 'locked', index: null, sessionId: id }));

  const updatedIds: string[] = [];
  const reassignedIds: string[] = [];
  for (const update of updates) {
    const previousGvnnContactId =
      existingById.get(update.id)?.gvnnContactId ?? null;
    const updated = await updateScheduleSession({
      ...context,
      gvnnChanged: previousGvnnContactId !== update.write.gvnnContactId,
      id: update.id,
      previousGvnnContactId,
      session: update.write,
    });
    if (updated.kind === 'updated') {
      updatedIds.push(update.id);
      const before = existingById.get(update.id)?.teacherWorkspaceUserId;
      const after = update.write.teacherWorkspaceUserId;
      if (after && after !== before) reassignedIds.push(update.id);
    } else {
      conflicts.push({
        code: updated.kind === 'partial' ? 'partially_applied' : 'locked',
        ...(updated.kind === 'partial' ? { fields: updated.fields } : {}),
        index: input.sessions.findIndex((row) => row.id === update.id),
        sessionId: update.id,
      });
    }
  }
  const createdIds = await insertScheduleSessions({
    ...context,
    sessions: inserts,
    sourceName: `schedule ${month}`,
  });

  const saved = {
    // New sessions without a GVCN are ignored by the notifier.
    assignedIds: [...createdIds, ...reassignedIds],
    createdIds,
    deletedIds: [
      ...cancelled,
      ...input.deleteIds.filter((id) => alreadyCancelled.has(id)),
    ],
    existingIds,
    updatedIds,
  };
  if (conflicts.length > 0) {
    return { conflict: true, ok: false, rowErrors: conflicts, saved };
  }
  return { ...saved, ok: true };
}
