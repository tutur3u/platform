import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import { InternalApiError, parseInternalApiError } from './internal-api-error';
import type { TopicAssignmentNotificationResult } from './topic-announcements';

/** One GVNN schedule session. Dates are `YYYY-MM-DD`, times `HH:MM`. */
export interface TopicScheduleSession {
  classLabel: string | null;
  durationMinutes: number | null;
  endTime: string | null;
  groupId: string | null;
  /** The GVNN contact; null while the session still needs one. */
  gvnnContactId: string | null;
  hasTopic: boolean;
  id: string;
  place: string | null;
  room: string | null;
  sentAt: string | null;
  sessionDate: string;
  startTime: string;
  status: string;
  /** GVCN: the class's homeroom teacher, assigned by the server. */
  teacherWorkspaceUserId: string | null;
}

export interface TopicScheduleClass {
  id: string;
  name: string;
  primaryTeacherId: string | null;
  teachers: { id: string; name: string }[];
}

export interface TopicScheduleGvnnContact {
  email: string;
  id: string;
  /** False for an untagged contact a session already uses. */
  isGvnn: boolean;
  name: string;
}

export interface TopicScheduleMonth {
  classes: TopicScheduleClass[];
  gvnnContacts: TopicScheduleGvnnContact[];
  sessions: TopicScheduleSession[];
}

export interface TopicScheduleSessionInput {
  durationMinutes: number;
  groupId: string;
  gvnnContactId: string | null;
  id?: string;
  place?: string | null;
  room?: string | null;
  sessionDate: string;
  startTime: string;
}

export type TopicScheduleRowErrorCode =
  | 'duplicate_slot'
  | 'ends_after_midnight'
  | 'invalid_class'
  | 'invalid_contact'
  | 'locked'
  | 'not_found'
  | 'outside_month';

export interface TopicScheduleRowError {
  code: TopicScheduleRowErrorCode;
  index: number | null;
  sessionId: string | null;
}

/** Outcome of "notify teachers"; null when it was off or nothing changed. */
export type TopicScheduleNotification =
  | { failed: false; result: TopicAssignmentNotificationResult }
  | { failed: true; result: null }
  | null;

export interface TopicScheduleSaveResult {
  /** Sessions this save created or moved to another teacher. */
  assignedIds: string[];
  createdIds: string[];
  deletedIds: string[];
  existingIds: string[];
  notification: TopicScheduleNotification;
  updatedIds: string[];
}

export interface TopicScheduleCloneItem {
  classLabel: string | null;
  endTime: string | null;
  gvnnContactId: string | null;
  reason: 'class_removed' | 'no_such_weekday' | null;
  sourceDate: string;
  sourceId: string;
  startTime: string;
  /** `removed`: the target slot's session was removed; skipped by default. */
  status: 'create' | 'exists' | 'removed' | 'unplaced';
  targetDate: string | null;
  teacherWorkspaceUserId: string | null;
  weekday: number;
  weekdayOccurrence: number;
}

/**
 * Thrown when a save is rejected. With `conflict` false nothing was written;
 * with `conflict` true some sessions entered delivery mid-save and were left
 * unchanged while the rest were saved, so the month should be reloaded.
 */
export class TopicScheduleSaveRejectedError extends InternalApiError {
  constructor(
    public readonly rowErrors: TopicScheduleRowError[],
    public readonly conflict: boolean
  ) {
    super(
      conflict ? 'Some sessions changed while saving' : 'Invalid sessions',
      conflict ? 409 : 400,
      conflict ? 'SCHEDULE_CONFLICT' : 'SCHEDULE_ROWS_INVALID'
    );
    this.name = 'TopicScheduleSaveRejectedError';
  }
}

function schedulePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/topic-announcements/schedule`;
}

export async function getTopicScheduleMonth(
  workspaceId: string,
  month: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ data: TopicScheduleMonth }>(schedulePath(workspaceId), {
    cache: 'no-store',
    query: { month },
  });
}

export async function saveTopicScheduleMonth(
  workspaceId: string,
  payload: {
    deleteIds: string[];
    month: string;
    /** Notify the GVCN of sessions this save assigns to them. */
    notifyTeachers?: boolean;
    sessions: TopicScheduleSessionInput[];
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(schedulePath(workspaceId), {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });

  if (response.status === 400 || response.status === 409) {
    const data = (await response
      .clone()
      .json()
      .catch(() => null)) as { rowErrors?: TopicScheduleRowError[] } | null;
    if (data?.rowErrors?.length) {
      throw new TopicScheduleSaveRejectedError(
        data.rowErrors,
        response.status === 409
      );
    }
  }
  if (!response.ok) throw await parseInternalApiError(response);

  return (await response.json()) as { data: TopicScheduleSaveResult };
}

export async function cloneTopicScheduleMonth(
  workspaceId: string,
  payload: {
    dryRun: boolean;
    includeRemoved?: boolean;
    notifyTeachers?: boolean;
    sourceMonth: string;
    targetMonth: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: {
      createdIds: string[];
      items: TopicScheduleCloneItem[];
      notification: TopicScheduleNotification;
    };
  }>(`${schedulePath(workspaceId)}/clone`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}
