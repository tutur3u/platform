import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskSortBy } from '@tuturuuu/utils/task-helper';
import { loadPriorityPage } from './priority-page';

export type ExternalTaskSortBy =
  | 'created-desc'
  | 'created-asc'
  | 'due-asc'
  | 'name-asc'
  | 'source-asc';
export type TaskSourceScope =
  | 'all_visible'
  | 'current_board'
  | 'external_current_workspace'
  | 'external_specific';
export type ExternalSourceStatus =
  | 'not_started'
  | 'active'
  | 'review'
  | 'documents'
  | 'done'
  | 'closed';
type TaskSourceFilterIdRow = {
  list_id: string | null;
  task_id: string | null;
  total_count: number | string | null;
};

export async function loadTaskSourceFilterIds(
  options: Parameters<typeof loadTaskSourceFilterIdsPage>[0] & {
    unprioritizedPosition: 'first' | 'last';
  }
) {
  return loadPriorityPage(options, (page) =>
    loadTaskSourceFilterIdsPage({ ...options, ...page })
  );
}

async function loadTaskSourceFilterIdsPage({
  sbAdmin,
  userId,
  workspaceId,
  boardId,
  listId,
  sourceScope,
  sourceWorkspaceIds,
  sourceBoardIds,
  listStatuses,
  searchQuery,
  parsedIdentifier,
  assignedToMe,
  completedMode,
  closedMode,
  includeArchivedBoards,
  includeDeletedMode,
  hasDueDate,
  externalSortBy,
  sortBy,
  labelIds,
  assigneeIds,
  projectIds,
  priorities,
  estimationMin,
  estimationMax,
  dueDateFrom,
  dueDateTo,
  includeUnassigned,
  limit,
  offset,
}: {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  workspaceId: string;
  boardId: string | null;
  listId: string | null;
  sourceScope: TaskSourceScope;
  sourceWorkspaceIds: string[];
  sourceBoardIds: string[];
  listStatuses: ExternalSourceStatus[];
  searchQuery?: string;
  parsedIdentifier: {
    displayNumber: number;
    ticketPrefix: string | null;
  } | null;
  assignedToMe: boolean;
  completedMode: string | null;
  closedMode: string | null;
  includeArchivedBoards: boolean;
  includeDeletedMode: 'all' | 'none' | 'only';
  hasDueDate: boolean;
  externalSortBy: ExternalTaskSortBy;
  sortBy?: TaskSortBy;
  labelIds: string[];
  assigneeIds: string[];
  projectIds: string[];
  priorities: string[];
  estimationMin: number | null;
  estimationMax: number | null;
  dueDateFrom: string | null;
  dueDateTo: string | null;
  includeUnassigned: boolean;
  limit: number;
  offset: number;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('list_task_source_filter_ids', {
      p_actor_id: userId,
      p_workspace_id: workspaceId,
      p_board_id: boardId ?? undefined,
      p_list_id: listId ?? undefined,
      p_source_scope: sourceScope,
      p_source_workspace_ids: sourceWorkspaceIds,
      p_source_board_ids: sourceBoardIds,
      p_list_statuses: listStatuses,
      p_search: searchQuery ?? undefined,
      p_display_number: parsedIdentifier?.displayNumber ?? undefined,
      p_ticket_prefix: parsedIdentifier?.ticketPrefix ?? undefined,
      p_assigned_to_me: assignedToMe,
      p_completed_mode: completedMode ?? undefined,
      p_closed_mode: closedMode ?? undefined,
      p_include_archived_boards: includeArchivedBoards,
      p_include_deleted: includeDeletedMode,
      p_has_due_date: hasDueDate,
      p_sort_by: sortBy ?? externalSortBy,
      p_limit: limit,
      p_offset: offset,
      p_label_ids: labelIds.length > 0 ? labelIds : undefined,
      p_assignee_ids: assigneeIds.length > 0 ? assigneeIds : undefined,
      p_project_ids: projectIds.length > 0 ? projectIds : undefined,
      p_priorities: priorities.length > 0 ? priorities : undefined,
      p_estimation_min: estimationMin ?? undefined,
      p_estimation_max: estimationMax ?? undefined,
      p_due_date_from: dueDateFrom ?? undefined,
      p_due_date_to: dueDateTo ?? undefined,
      p_include_unassigned: includeUnassigned,
    });

  if (error) {
    throw new Error('TASK_SOURCE_FILTER_RPC_FAILED', { cause: error });
  }

  const rows = ((data ?? []) as TaskSourceFilterIdRow[]).filter(
    (row): row is TaskSourceFilterIdRow & { task_id: string } =>
      Boolean(row.task_id)
  );
  const taskIds = rows.map((row) => row.task_id);
  const count = Number(rows[0]?.total_count ?? 0);

  return { count: Number.isFinite(count) ? count : 0, taskIds };
}
