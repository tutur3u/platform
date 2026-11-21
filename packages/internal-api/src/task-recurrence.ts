import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';
import { InternalApiError } from './internal-api-error';

/** The schedule half of a series spec, as the shared task planner builds it. */
export interface WorkspaceTaskRecurrenceSchedule {
  rule: CalendarRecurrenceRule;
  anchorDate: string;
  dueTime: string | null;
  startOffsetDays: number;
}

export interface WorkspaceTaskRecurrenceTemplate {
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  estimate: number | null;
  labels: string[];
  projects: string[];
  assignees: string[];
}

export interface WorkspaceTaskRecurrenceSpec {
  schedule: WorkspaceTaskRecurrenceSchedule;
  template: WorkspaceTaskRecurrenceTemplate;
}

export type WorkspaceTaskRecurrenceState =
  | 'active'
  | 'paused'
  | 'ended'
  | (string & {});

/** One task's series link. Template fields come back only when requested by
 * a member who may manage the series. */
export interface WorkspaceTaskRecurrenceEntry {
  task_id: string;
  series_id: string;
  occurrence_date: string;
  state: WorkspaceTaskRecurrenceState;
  revision: number;
  progress: number;
  rule?: CalendarRecurrenceRule;
  template?: WorkspaceTaskRecurrenceTemplate;
  anchor_date?: string;
  due_time?: string | null;
  start_offset_days?: number;
}

export interface WorkspaceTaskRecurrenceVersion {
  seriesId: string;
  taskId: string;
  revision: number;
  progress: number;
}

export type WorkspaceTaskRecurrenceStatusAction = 'pause' | 'resume' | 'end';

export const TASK_RECURRENCE_READ_LIMIT = 100;

function recurrencePath(wsId: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/tasks/recurrence`;
}

function post<T>(
  wsId: string,
  body: Record<string, unknown>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withTaskApiBaseUrl(options)).json<T>(
    recurrencePath(wsId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'include',
    }
  );
}

/** The API answers 404 while the feature is dormant or the actor is not an
 * eligible member, so callers can render nothing. */
export function isTaskRecurrenceUnavailable(error: unknown) {
  return error instanceof InternalApiError && error.status === 404;
}

/** A create receipt for a list, or null when recurrence is unavailable to the
 * actor there. */
export async function prepareWorkspaceTaskRecurrence(
  wsId: string,
  listId: string,
  options?: InternalApiClientOptions
) {
  try {
    const { receipt } = await post<{ receipt: string }>(
      wsId,
      { operation: 'prepare', listId },
      options
    );
    return receipt;
  } catch (error) {
    if (isTaskRecurrenceUnavailable(error)) return null;
    throw error;
  }
}

/** A receipt for changing the series of an existing task, or null. */
export async function prepareWorkspaceTaskRecurrenceTask(
  wsId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  try {
    const { receipt } = await post<{ receipt: string }>(
      wsId,
      { operation: 'prepareTask', taskId },
      options
    );
    return receipt;
  } catch (error) {
    if (isTaskRecurrenceUnavailable(error)) return null;
    throw error;
  }
}

export function createWorkspaceTaskRecurrence(
  wsId: string,
  payload: {
    listId: string;
    receipt: string;
    spec: WorkspaceTaskRecurrenceSpec;
  },
  options?: InternalApiClientOptions
) {
  return post<{ series_id: string; task_id?: string; state?: string }>(
    wsId,
    { operation: 'create', ...payload },
    options
  );
}

export function editWorkspaceTaskRecurrence(
  wsId: string,
  payload: WorkspaceTaskRecurrenceVersion & {
    receipt: string;
    spec: WorkspaceTaskRecurrenceSpec;
  },
  options?: InternalApiClientOptions
) {
  return post<{ series_id: string; state?: string }>(
    wsId,
    { operation: 'edit', ...payload },
    options
  );
}

export function setWorkspaceTaskRecurrenceStatus(
  wsId: string,
  payload: WorkspaceTaskRecurrenceVersion & {
    receipt: string;
    action: WorkspaceTaskRecurrenceStatusAction;
  },
  options?: InternalApiClientOptions
) {
  return post<{ series_id: string; state?: string }>(
    wsId,
    { operation: 'status', ...payload },
    options
  );
}

/** Series links for up to 100 tasks; an empty list when unavailable. */
export async function readWorkspaceTaskRecurrence(
  wsId: string,
  taskIds: string[],
  includeTemplate = false,
  options?: InternalApiClientOptions
) {
  if (taskIds.length === 0) return [];
  if (taskIds.length > TASK_RECURRENCE_READ_LIMIT)
    throw new RangeError(
      `At most ${TASK_RECURRENCE_READ_LIMIT} tasks per recurrence read`
    );
  try {
    const entries = await post<WorkspaceTaskRecurrenceEntry[]>(
      wsId,
      { operation: 'read', taskIds, includeTemplate },
      options
    );
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (isTaskRecurrenceUnavailable(error)) return [];
    throw error;
  }
}
