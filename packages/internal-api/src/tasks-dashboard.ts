import type { TaskWithRelations } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';
import {
  type CurrentUserTaskDialogResponse,
  listWorkspaceTaskLists,
  updateWorkspaceTask,
  upsertCurrentUserTaskPersonalPlacement,
} from './tasks';

export interface UserTaskDashboard {
  overdue: TaskWithRelations[];
  today: TaskWithRelations[];
  upcoming: TaskWithRelations[];
  totalActiveTasks: number;
}

/** Read the Tasks app feed, including personal overrides and cross-workspace tasks. */
export async function getUserTaskDashboard(
  scope: { wsId: string; isPersonal: boolean },
  options?: InternalApiClientOptions
) {
  const result = await getInternalApiClient(
    withTaskApiBaseUrl(options)
  ).json<UserTaskDashboard>('/api/v1/users/me/tasks', {
    query: { ...scope, completedLimit: 0 },
    cache: 'no-store',
    credentials: 'include',
  });
  const active = (tasks: TaskWithRelations[]) =>
    tasks.filter((task) => {
      const state = task as TaskWithRelations & {
        completed?: boolean | null;
        completed_at?: string | null;
        closed_at?: string | null;
      };
      return !state.completed && !state.completed_at && !state.closed_at;
    });
  const overdue = active(result.overdue);
  const today = active(result.today);
  const upcoming = active(result.upcoming);
  return {
    overdue,
    today,
    upcoming,
    totalActiveTasks: overdue.length + today.length + upcoming.length,
  };
}

export async function getCurrentUserTask(
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTaskApiBaseUrl(options));
  return client.json<CurrentUserTaskDialogResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}`,
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
}

export interface CurrentUserTaskOverridesPayload {
  completed_at?: string | null;
  personally_unassigned?: boolean;
}

/** Writes the signed-in user's own override for a task (Tasks app route). */
export async function updateCurrentUserTaskOverrides(
  taskId: string,
  payload: CurrentUserTaskOverridesPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withTaskApiBaseUrl(options)).json<{
    data: unknown;
  }>(`/api/v1/users/me/tasks/${encodePathSegment(taskId)}/overrides`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'include',
  });
}

export type TaskCompletionPath =
  | 'personal_completion'
  | 'personal_placement'
  | 'done_list';

/** Why a task from the feed cannot be completed in place. */
export class TaskCompletionUnavailableError extends Error {
  constructor(readonly reason: 'not_on_board' | 'done_list_missing' | 'unassigned') {
    super(`Task cannot be completed: ${reason}`);
    this.name = 'TaskCompletionUnavailableError';
  }
}

/**
 * Completes an active task for the signed-in user with the same rules as the
 * Tasks app's My Tasks list:
 * - self-managed tasks record a personal completion (`completed_at`);
 * - tasks placed on the user's personal board move to its done state;
 * - otherwise the task moves to its board's list whose status is `done`.
 * After a board or placement completion, stale personal completion flags are
 * cleared, as My Tasks does. Authorization stays with each existing route.
 */
export async function completeCurrentUserTask(
  task: TaskWithRelations,
  options?: InternalApiClientOptions
): Promise<TaskCompletionPath> {
  const overrides = task.overrides ?? null;

  if (overrides?.personally_unassigned) {
    throw new TaskCompletionUnavailableError('unassigned');
  }

  if (overrides?.self_managed) {
    await updateCurrentUserTaskOverrides(
      task.id,
      { completed_at: new Date().toISOString() },
      options
    );
    return 'personal_completion';
  }

  const clearStalePersonalFlags = async () => {
    if (!overrides?.completed_at) return;
    // Non-critical cleanup: the completion itself already succeeded.
    await updateCurrentUserTaskOverrides(
      task.id,
      { completed_at: null, personally_unassigned: false },
      options
    ).catch(() => undefined);
  };

  if (overrides?.personal_board_id) {
    await upsertCurrentUserTaskPersonalPlacement(
      task.id,
      {
        personal_board_id: overrides.personal_board_id,
        personal_list_id: overrides.personal_list_id ?? null,
        terminal_status: 'done',
      },
      options
    );
    await clearStalePersonalFlags();
    return 'personal_placement';
  }

  const board = task.list?.board;
  if (!board?.id || !board.ws_id) {
    throw new TaskCompletionUnavailableError('not_on_board');
  }

  const { lists } = await listWorkspaceTaskLists(board.ws_id, board.id, options);
  const doneList = lists?.find((list) => list.status === 'done');
  if (!doneList) throw new TaskCompletionUnavailableError('done_list_missing');

  await updateWorkspaceTask(board.ws_id, task.id, { list_id: doneList.id }, options);
  await clearStalePersonalFlags();
  return 'done_list';
}
