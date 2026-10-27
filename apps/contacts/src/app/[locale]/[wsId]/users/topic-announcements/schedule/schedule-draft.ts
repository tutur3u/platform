import type {
  TopicScheduleClass,
  TopicScheduleSession,
  TopicScheduleSessionInput,
} from '@tuturuuu/internal-api/topic-announcements';
import {
  addMinutesToScheduleTime,
  isScheduleDate,
  normalizeScheduleTime,
  scheduleDateMonth,
  scheduleSlotKey,
  TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES,
  TOPIC_SCHEDULE_MAX_DURATION_MINUTES,
  TOPIC_SCHEDULE_MIN_DURATION_MINUTES,
} from '@tuturuuu/utils/topic-schedule';

/** Statuses handed to delivery; the server refuses to edit them. */
const LOCKED_STATUSES = new Set(['processing', 'queued', 'sent']);

/** One editable row. `key` is the server id or a local `new:<n>` key. */
export interface DraftSession {
  durationMinutes: number;
  groupId: string | null;
  gvnnContactId: string | null;
  hasTopic: boolean;
  id: string | null;
  key: string;
  locked: boolean;
  place: string;
  room: string;
  sessionDate: string;
  startTime: string;
  /** Saved status; new rows are `draft`. */
  status: string;
  /** GVCN as saved; null for a new row (the server assigns it). */
  teacherWorkspaceUserId: string | null;
}

export type DraftIssue =
  | 'duplicate_slot'
  | 'ends_after_midnight'
  | 'invalid_duration'
  | 'invalid_time'
  | 'missing_class'
  | 'outside_month';

export function draftFromSessions(
  sessions: readonly TopicScheduleSession[]
): DraftSession[] {
  return sessions.map((session) => ({
    durationMinutes:
      session.durationMinutes ?? TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES,
    groupId: session.groupId,
    gvnnContactId: session.gvnnContactId,
    hasTopic: session.hasTopic,
    id: session.id,
    key: session.id,
    locked: LOCKED_STATUSES.has(session.status),
    status: session.status,
    place: session.place ?? '',
    room: session.room ?? '',
    sessionDate: session.sessionDate,
    startTime: session.startTime,
    teacherWorkspaceUserId: session.teacherWorkspaceUserId,
  }));
}

export function newDraftSession(
  key: string,
  sessionDate: string,
  previous?: Pick<DraftSession, 'place' | 'room' | 'startTime'>
): DraftSession {
  return {
    durationMinutes: TOPIC_SCHEDULE_DEFAULT_DURATION_MINUTES,
    groupId: null,
    gvnnContactId: null,
    hasTopic: false,
    id: null,
    key,
    locked: false,
    status: 'draft',
    place: previous?.place ?? '',
    room: previous?.room ?? '',
    sessionDate,
    startTime: previous?.startTime ?? '17:30',
    teacherWorkspaceUserId: null,
  };
}

export function draftEndTime(
  row: Pick<DraftSession, 'durationMinutes' | 'startTime'>
) {
  return addMinutesToScheduleTime(row.startTime, row.durationMinutes);
}

const COMPARED_FIELDS = [
  'durationMinutes',
  'groupId',
  'gvnnContactId',
  'place',
  'room',
  'sessionDate',
  'startTime',
] as const;

export function isDraftRowChanged(row: DraftSession, original?: DraftSession) {
  if (!original) return true;
  return COMPARED_FIELDS.some((field) => row[field] !== original[field]);
}

/** Problems that block saving, by row key. A missing GVNN is not one. */
export function validateDraft(rows: readonly DraftSession[], month: string) {
  const issues = new Map<string, DraftIssue[]>();
  const add = (key: string, issue: DraftIssue) =>
    issues.set(key, [...(issues.get(key) ?? []), issue]);

  const slots = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.groupId) add(row.key, 'missing_class');
    if (
      !isScheduleDate(row.sessionDate) ||
      scheduleDateMonth(row.sessionDate) !== month
    ) {
      add(row.key, 'outside_month');
    }
    const validDuration =
      Number.isInteger(row.durationMinutes) &&
      row.durationMinutes >= TOPIC_SCHEDULE_MIN_DURATION_MINUTES &&
      row.durationMinutes <= TOPIC_SCHEDULE_MAX_DURATION_MINUTES;
    if (!normalizeScheduleTime(row.startTime)) add(row.key, 'invalid_time');
    else if (!validDuration) add(row.key, 'invalid_duration');
    else if (!draftEndTime(row)) add(row.key, 'ends_after_midnight');

    if (row.groupId) {
      const slot = scheduleSlotKey(row);
      slots.set(slot, [...(slots.get(slot) ?? []), row.key]);
    }
  }
  for (const keys of slots.values()) {
    if (keys.length > 1) for (const key of keys) add(key, 'duplicate_slot');
  }
  return issues;
}

/**
 * The PUT payload: new and changed rows plus removed saved sessions.
 * `sessionKeys[i]` is the editor row of `payload.sessions[i]`, so row errors
 * from a rejected save can be shown on the right row.
 */
export function draftSavePayload(
  rows: readonly DraftSession[],
  original: readonly DraftSession[],
  month: string
) {
  const originalByKey = new Map(original.map((row) => [row.key, row]));
  const keptIds = new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
  const changed = rows.filter(
    (row) => !row.locked && isDraftRowChanged(row, originalByKey.get(row.key))
  );
  const sessions: TopicScheduleSessionInput[] = changed.map((row) => ({
    durationMinutes: row.durationMinutes,
    groupId: row.groupId ?? '',
    gvnnContactId: row.gvnnContactId,
    ...(row.id ? { id: row.id } : {}),
    place: row.place.trim() || null,
    room: row.room.trim() || null,
    sessionDate: row.sessionDate,
    startTime: normalizeScheduleTime(row.startTime) ?? row.startTime,
  }));
  const deleteIds = original
    .filter((row) => row.id && !keptIds.has(row.id))
    .map((row) => row.id as string);
  return {
    payload: { deleteIds, month, sessions },
    sessionKeys: changed.map((row) => row.key),
  };
}

export function countDraftChanges(
  rows: readonly DraftSession[],
  original: readonly DraftSession[]
) {
  const { payload } = draftSavePayload(rows, original, '');
  return payload.sessions.length + payload.deleteIds.length;
}

/**
 * The GVCN shown for a row (read-only). A saved row in its saved class keeps
 * its teacher; otherwise it is the class's auto-assigned GVCN, which is what
 * the server will store on save.
 */
export function draftGvcnId(
  row: DraftSession,
  original: DraftSession | undefined,
  classById: ReadonlyMap<string, TopicScheduleClass>
) {
  if (
    original &&
    original.groupId === row.groupId &&
    row.teacherWorkspaceUserId
  ) {
    return row.teacherWorkspaceUserId;
  }
  return row.groupId
    ? (classById.get(row.groupId)?.primaryTeacherId ?? null)
    : null;
}
