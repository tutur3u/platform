import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalSourceStatus,
  TaskSourceScope,
} from './load-task-source-filter-ids';

type TaskSourceFilterListCountRow = {
  list_id: string | null;
  total_count: number | string | null;
};

export async function loadTaskSourceFilterListCounts({
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
  labelIds,
  assigneeIds,
  projectIds,
  priorities,
  estimationMin,
  estimationMax,
  dueDateFrom,
  dueDateTo,
  includeUnassigned,
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
  labelIds: string[];
  assigneeIds: string[];
  projectIds: string[];
  priorities: string[];
  estimationMin: number | null;
  estimationMax: number | null;
  dueDateFrom: string | null;
  dueDateTo: string | null;
  includeUnassigned: boolean;
}) {
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('count_task_source_filter_lists', {
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
    throw new Error('TASK_SOURCE_FILTER_COUNTS_RPC_FAILED', { cause: error });
  }

  return ((data ?? []) as TaskSourceFilterListCountRow[]).flatMap((row) => {
    if (!row.list_id) return [];
    const count = Number(row.total_count ?? 0);
    return [
      {
        list_id: row.list_id,
        count: Number.isFinite(count) ? count : 0,
      },
    ];
  });
}
