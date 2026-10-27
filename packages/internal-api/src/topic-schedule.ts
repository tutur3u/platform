import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import { InternalApiError, parseInternalApiError } from './internal-api-error';

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

export interface TopicScheduleSaveResult {
  createdIds: string[];
  deletedIds: string[];
  existingIds: string[];
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
  status: 'create' | 'exists' | 'unplaced';
  targetDate: string | null;
  teacherWorkspaceUserId: string | null;
  weekday: number;
  weekdayOccurrence: number;
}

/** Thrown when a save is rejected; nothing was written. */
export class TopicScheduleSaveRejectedError extends InternalApiError {
  constructor(public readonly rowErrors: TopicScheduleRowError[]) {
    super('Invalid sessions', 400, 'SCHEDULE_ROWS_INVALID');
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

  if (response.status === 400) {
    const data = (await response
      .clone()
      .json()
      .catch(() => null)) as { rowErrors?: TopicScheduleRowError[] } | null;
    if (data?.rowErrors?.length) {
      throw new TopicScheduleSaveRejectedError(data.rowErrors);
    }
  }
  if (!response.ok) throw await parseInternalApiError(response);

  return (await response.json()) as { data: TopicScheduleSaveResult };
}

export async function cloneTopicScheduleMonth(
  workspaceId: string,
  payload: { dryRun: boolean; sourceMonth: string; targetMonth: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: { createdIds: string[]; items: TopicScheduleCloneItem[] };
  }>(`${schedulePath(workspaceId)}/clone`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}
