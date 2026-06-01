import type {
  Database,
  TaskProjectWithRelations,
  WorkspaceTaskBoardRow,
} from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatusTemplate } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type {
  CreateTaskRelationshipInput,
  RelatedTaskInfo,
  TaskRelationship,
  TaskRelationshipsResponse,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface InternalApiTaskProjectSummary {
  id: string;
  name: string;
  status: string | null;
}

export interface TaskProjectLinkedSourceTask {
  id: string;
  name?: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
  closed_at?: string | null;
  deleted_at?: string | null;
  priority?: string | null;
  task_lists?: {
    name?: string | null;
    status?: string | null;
  } | null;
}

export interface TaskProjectLinkedSourceRow<
  TTask extends TaskProjectLinkedSourceTask = TaskProjectLinkedSourceTask,
> {
  task?: TTask | null;
}

export interface TaskProjectLinkedItem {
  id: string;
  name: string;
  completed: boolean | null;
  completed_at: string | null;
  closed_at: string | null;
  priority: TaskPriority | null;
  listName: string | null;
  listStatus: string | null;
}

export interface TaskProjectLinkedPartition {
  linkedTasks: TaskProjectLinkedItem[];
  linkedDocuments: TaskProjectLinkedItem[];
  tasksCount: number;
  completedTasksCount: number;
}

export type WorkspaceTaskProject = TaskProjectWithRelations & {
  tasksCount: number;
  completedTasksCount: number;
  linkedTasks: TaskProjectLinkedItem[];
  linkedDocuments: TaskProjectLinkedItem[];
};

export interface WorkspaceTaskProjectTasksResponse {
  tasks: Task[];
  documents: Task[];
  lists: TaskList[];
}

export interface InternalApiWorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  ws_id: string;
  creator_id: string | null;
}

export interface WorkspaceTaskUpdatePayload {
  name?: string;
  description?: string | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  closed_at?: string | null;
  completed_at?: string | null;
  list_id?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
  project_ids?: string[];
  completed?: boolean;
  deleted?: boolean;
  sort_key?: number;
}

export interface WorkspaceTaskApiTask extends Task {
  assignee_ids?: string[];
  label_ids?: string[];
  project_ids?: string[];
  description_yjs_state?: number[] | null;
  board_id?: string | null;
  board_name?: string;
  ticket_prefix?: string | null;
  deleted_at?: string;
  list_deleted?: boolean;
  source_workspace_id?: string | null;
  source_workspace_name?: string | null;
  source_board_id?: string | null;
  source_board_name?: string | null;
  source_list_id?: string | null;
  source_list_name?: string | null;
  source_list_status?: string | null;
  personal_board_id?: string | null;
  personal_list_id?: string | null;
  personal_sort_key?: number | null;
  personal_added_at?: string | null;
  personal_placed_at?: string | null;
  is_personal_external?: boolean;
  is_personal_external_default?: boolean;
}

export interface CurrentUserTaskPersonalPlacementPayload {
  personal_board_id: string;
  personal_list_id?: string | null;
  personal_sort_key?: number | null;
  previous_task_id?: string | null;
  next_task_id?: string | null;
}

export interface CurrentUserTaskPersonalPlacementResponse {
  task: WorkspaceTaskApiTask;
}

export interface WorkspaceTaskResponse {
  task: WorkspaceTaskApiTask;
}

export interface CurrentUserTaskDialogResponse {
  task: WorkspaceTaskApiTask;
  availableLists: TaskList[];
  taskWsId: string;
  taskWorkspacePersonal: boolean;
  taskWorkspaceTier: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';
}

export interface ListWorkspaceTasksOptions {
  boardId?: string;
  listId?: string;
  listStatuses?: string[];
  sourceScope?: TaskSourceScope;
  sourceWorkspaceIds?: string[];
  sourceBoardIds?: string[];
  q?: string;
  identifier?: string;
  limit?: number;
  offset?: number;
  assignedToMe?: boolean;
  completed?: 'exclude' | 'only';
  closed?: 'exclude' | 'only';
  hasDueDate?: boolean;
  externalIncludeDocuments?: boolean;
  externalIncludeDoneClosed?: boolean;
  externalSortBy?: ExternalTaskSortBy;
  forTimeTracking?: boolean;
  includeRelationshipSummary?: boolean;
  includeArchivedBoards?: boolean;
  includeDeleted?: boolean | 'only';
  includeCount?: boolean;
}

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

export interface WorkspaceTasksResponse {
  tasks: WorkspaceTaskApiTask[];
  count?: number;
  pagination?: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    offset: number;
    page: number;
    pageCount: number;
    pageSize: number;
    total: number;
  };
}

function joinQueryList(values?: string[]) {
  return values && values.length > 0 ? values.join(',') : undefined;
}

export type WorkspaceTaskBoardListItem = Pick<
  WorkspaceTaskBoardRow,
  | 'id'
  | 'ws_id'
  | 'name'
  | 'icon'
  | 'archived_at'
  | 'deleted_at'
  | 'created_at'
  | 'ticket_prefix'
  | 'estimation_type'
  | 'extended_estimation'
  | 'allow_zero_estimates'
  | 'count_unestimated_issues'
> & {
  list_count?: number;
  task_count?: number;
};

export interface WorkspaceTaskListSummary {
  id: string;
  name: string | null;
  status: string | null;
  color: string | null;
  position: number | null;
  deleted?: boolean;
}

export type WorkspaceTaskBoardDetail = WorkspaceTaskBoardRow & {
  task_lists?: WorkspaceTaskListSummary[];
};

export type WorkspaceTaskBoardWithLists = Pick<
  WorkspaceTaskBoardRow,
  'id' | 'name' | 'created_at'
> & {
  task_lists: WorkspaceTaskListSummary[];
};

export interface ListWorkspaceTaskBoardsOptions {
  q?: string;
  page?: number;
  pageSize?: number;
  status?: 'active' | 'archived' | 'deleted' | 'all';
}

export interface ListWorkspaceTaskBoardsResponse {
  boards: WorkspaceTaskBoardListItem[];
  count: number;
}

export interface WorkspaceBoardsDataResponse {
  data: WorkspaceTaskBoardDetail[];
  count: number;
  access_type?: 'member' | 'guest';
  guest_highest_permission?: 'view' | 'edit' | null;
}

export type WorkspaceBoardNavigationItem = Pick<
  WorkspaceTaskBoardRow,
  'id' | 'name' | 'deleted_at' | 'archived_at'
>;

export interface ListWorkspaceBoardsResponse {
  boards: WorkspaceBoardNavigationItem[];
}

export type CreateWorkspaceTaskBoardPayload = Pick<
  Database['public']['Tables']['workspace_boards']['Insert'],
  'name' | 'icon' | 'template_id'
>;

export type UpdateWorkspaceTaskBoardPayload = Pick<
  Database['public']['Tables']['workspace_boards']['Update'],
  'name' | 'icon' | 'ticket_prefix'
> & {
  archived?: boolean;
  group_ids?: string[];
};

export interface UpdateWorkspaceTaskBoardEstimationPayload {
  estimation_type: WorkspaceTaskBoardRow['estimation_type'] | null;
  extended_estimation?: boolean;
  allow_zero_estimates?: boolean;
  count_unestimated_issues?: boolean;
}

export type WorkspaceTaskBoardEstimationConfig = Pick<
  WorkspaceTaskBoardRow,
  | 'id'
  | 'name'
  | 'estimation_type'
  | 'extended_estimation'
  | 'allow_zero_estimates'
  | 'count_unestimated_issues'
  | 'created_at'
>;

export interface CreateWorkspaceTaskPayload {
  name: string;
  listId: string;
  description?: string | null;
  description_yjs_state?: number[] | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  estimation_points?: number | null;
  label_ids?: string[];
  project_ids?: string[];
  assignee_ids?: string[];
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: Task['calendar_hours'];
  auto_schedule?: boolean | null;
}

export interface WorkspaceTaskJournalTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  estimationPoints?: number | null;
  projectIds?: string[];
  labels?: Array<{ id?: string; name: string }>;
}

export interface WorkspaceTaskJournalResultTask {
  id: string;
  name: string;
  description?: string | null;
  priority?: TaskPriority | null;
  labelSuggestions?: string[];
  dueDate?: string | null;
  labels?: Array<{ id?: string; name: string }>;
  estimationPoints?: number | null;
  projectIds?: string[];
  [key: string]: unknown;
}

export interface CreateWorkspaceTaskJournalPayload {
  entry: string;
  listId?: string;
  previewOnly?: boolean;
  tasks?: WorkspaceTaskJournalTaskInput[];
  generatedWithAI?: boolean;
  labelIds?: string[];
  assigneeIds?: string[];
  generateDescriptions?: boolean;
  generatePriority?: boolean;
  generateLabels?: boolean;
  clientTimezone?: string;
  clientTimestamp?: string;
}

export interface WorkspaceTaskJournalResponse {
  tasks: WorkspaceTaskJournalResultTask[];
  metadata?: {
    generatedWithAI?: boolean;
    totalTasks?: number;
  };
}

export interface WorkspaceTaskBoardResponse {
  board: Pick<
    WorkspaceTaskBoardRow,
    'id' | 'ws_id' | 'name' | 'icon' | 'template_id' | 'created_at'
  >;
}

export type WorkspaceTaskBoardSharePermission = 'view' | 'edit';

export interface WorkspaceTaskBoardShare {
  created_at: string | null;
  email: string | null;
  id: string;
  permission: WorkspaceTaskBoardSharePermission;
  user: {
    avatar_url: string | null;
    display_name: string | null;
    handle: string | null;
    id: string | null;
  } | null;
  user_id: string | null;
}

export interface WorkspaceTaskBoardSharesResponse {
  shares: WorkspaceTaskBoardShare[];
}

export interface CreateWorkspaceTaskListPayload {
  name: string;
  status?: string;
  color?: string;
}

export interface UpdateWorkspaceTaskListPayload {
  name?: string;
  status?: string;
  color?: string;
  position?: number;
  deleted?: boolean;
}

export interface WorkspaceTaskListResponse {
  list: TaskList;
}

export interface WorkspaceTaskListsResponse {
  lists: TaskList[];
}

export interface MoveWorkspaceTaskPayload {
  list_id: string;
  target_board_id?: string;
}

export interface MoveWorkspaceTaskResponse {
  task: WorkspaceTaskApiTask;
  movedToDifferentBoard: boolean;
  sourceBoardId: string;
  targetBoardId: string;
}

export type BulkWorkspaceTaskOperation =
  | {
      type: 'update_fields';
      updates: {
        priority?: TaskPriority | null;
        start_date?: string | null;
        end_date?: string | null;
        estimation_points?: number | null;
        deleted?: boolean;
      };
    }
  | {
      type: 'move_to_list';
      listId: string;
      targetBoardId?: string;
    }
  | {
      type: 'add_label';
      labelId: string;
    }
  | {
      type: 'remove_label';
      labelId: string;
    }
  | {
      type: 'add_project';
      projectId: string;
    }
  | {
      type: 'remove_project';
      projectId: string;
    }
  | {
      type: 'add_assignee';
      assigneeId: string;
    }
  | {
      type: 'remove_assignee';
      assigneeId: string;
    }
  | {
      type: 'clear_labels';
    }
  | {
      type: 'clear_projects';
    }
  | {
      type: 'clear_assignees';
    };

export interface BulkWorkspaceTasksResponse {
  successCount: number;
  failCount: number;
  taskIds: string[];
  succeededTaskIds: string[];
  failures: Array<{ taskId: string; error: string }>;
  taskMetaById?: Record<
    string,
    {
      list_id?: string;
      completed_at?: string | null;
      closed_at?: string | null;
    }
  >;
}

export interface CreateWorkspaceTaskWithRelationshipPayload {
  name: string;
  listId: string;
  currentTaskId: string;
  relationshipType: TaskRelationshipType;
  currentTaskIsSource: boolean;
}

export interface CreateWorkspaceTaskWithRelationshipResponse {
  task: WorkspaceTaskApiTask;
  relationship: TaskRelationship;
}

interface TaskProjectApiRow {
  id?: string;
  name?: string;
  status?: string | null;
}

function mapTaskProjectLinkedItem(
  task: TaskProjectLinkedSourceTask
): TaskProjectLinkedItem {
  return {
    id: task.id,
    name: task.name?.trim() || 'Untitled task',
    completed: task.completed ?? null,
    completed_at: task.completed_at ?? null,
    closed_at: task.closed_at ?? null,
    priority: (task.priority as TaskPriority | null | undefined) ?? null,
    listName: task.task_lists?.name ?? null,
    listStatus: task.task_lists?.status ?? null,
  };
}

export function partitionTaskProjectLinks<
  TTask extends TaskProjectLinkedSourceTask,
>(
  links?: TaskProjectLinkedSourceRow<TTask>[] | null
): TaskProjectLinkedPartition {
  const activeItems = (links ?? []).flatMap((link) => {
    const task = link.task;
    if (!task || task.deleted_at) return [];
    return [mapTaskProjectLinkedItem(task)];
  });

  const linkedDocuments = activeItems.filter(
    (item) => item.listStatus === 'documents'
  );
  const linkedTasks = activeItems.filter(
    (item) => item.listStatus !== 'documents'
  );

  return {
    linkedTasks,
    linkedDocuments,
    tasksCount: linkedTasks.length,
    completedTasksCount: linkedTasks.filter(
      (task) => task.completed_at !== null || task.closed_at !== null
    ).length,
  };
}

export async function listWorkspaceTaskProjects(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const projects = await client.json<TaskProjectApiRow[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      query: {
        compact: true,
      },
      cache: 'no-store',
    }
  );

  return (projects ?? []).flatMap(
    (project): InternalApiTaskProjectSummary[] => {
      if (!project?.id || !project?.name) {
        return [];
      }

      return [
        {
          id: project.id,
          name: project.name,
          status: project.status ?? null,
        },
      ];
    }
  );
}

export async function listWorkspaceTaskProjectDetails(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskProject[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceLabels(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const labels = await client.json<InternalApiWorkspaceLabel[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/labels`,
    {
      cache: 'no-store',
    }
  );

  return (labels ?? []).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

export async function createWorkspaceLabel(
  workspaceId: string,
  payload: { name: string; color: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceLabel>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/labels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceLabel(
  workspaceId: string,
  labelId: string,
  payload: { name: string; color: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceLabel>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/labels/${encodePathSegment(labelId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceLabel(
  workspaceId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/labels/${encodePathSegment(labelId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskBoards(
  workspaceId: string,
  options?: ListWorkspaceTaskBoardsOptions,
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<ListWorkspaceTaskBoardsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards`,
    {
      query: {
        q: options?.q,
        page: options?.page,
        pageSize: options?.pageSize,
        status: options?.status,
      },
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceBoardsData(
  workspaceId: string,
  options?: ListWorkspaceTaskBoardsOptions,
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceBoardsDataResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/boards-data`,
    {
      query: {
        q: options?.q,
        page: options?.page,
        pageSize: options?.pageSize,
      },
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceBoards(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListWorkspaceBoardsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/boards`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceBoardsWithLists(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ boards: WorkspaceTaskBoardWithLists[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/boards-with-lists`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskBoard(
  workspaceId: string,
  payload: CreateWorkspaceTaskBoardPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ board: WorkspaceTaskBoardDetail }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskBoard(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ board: WorkspaceTaskBoardDetail }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskBoardShares(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskBoardSharesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/shares`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskBoardShare(
  workspaceId: string,
  boardId: string,
  payload: { email: string; permission: WorkspaceTaskBoardSharePermission },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ share: WorkspaceTaskBoardShare }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/shares`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskBoardShare(
  workspaceId: string,
  boardId: string,
  payload: {
    permission: WorkspaceTaskBoardSharePermission;
    shareId: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ share: WorkspaceTaskBoardShare }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/shares`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskBoardShare(
  workspaceId: string,
  boardId: string,
  shareId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/shares`,
    {
      method: 'DELETE',
      query: { shareId },
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskBoard(
  workspaceId: string,
  boardId: string,
  payload: UpdateWorkspaceTaskBoardPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskBoardEstimation(
  workspaceId: string,
  boardId: string,
  payload: UpdateWorkspaceTaskBoardEstimationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskBoardEstimationConfig>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/boards/${encodePathSegment(boardId)}/estimation`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskBoard(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskProjectsByIds(
  workspaceId: string,
  projectIds: string[],
  options?: InternalApiClientOptions
) {
  if (projectIds.length === 0) {
    return [] as InternalApiTaskProjectSummary[];
  }

  const client = getInternalApiClient(options);
  const projects = await client.json<TaskProjectApiRow[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      query: {
        compact: true,
        ids: projectIds.join(','),
      },
      cache: 'no-store',
    }
  );

  return (projects ?? []).flatMap(
    (project): InternalApiTaskProjectSummary[] => {
      if (!project?.id || !project?.name) {
        return [];
      }

      return [
        {
          id: project.id,
          name: project.name,
          status: project.status ?? null,
        },
      ];
    }
  );
}

export async function addWorkspaceTaskLabel(
  workspaceId: string,
  taskId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/labels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labelId }),
      cache: 'no-store',
    }
  );
}

export async function removeWorkspaceTaskLabel(
  workspaceId: string,
  taskId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/labels`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labelId }),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskRelationships(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskRelationshipsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTasks(
  workspaceId: string,
  options?: ListWorkspaceTasksOptions,
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceTasksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks`,
    {
      query: {
        boardId: options?.boardId,
        listId: options?.listId,
        listStatuses: joinQueryList(options?.listStatuses),
        sourceScope: options?.sourceScope,
        sourceWorkspaceIds: joinQueryList(options?.sourceWorkspaceIds),
        sourceBoardIds: joinQueryList(options?.sourceBoardIds),
        q: options?.q,
        identifier: options?.identifier,
        limit: options?.limit,
        offset: options?.offset,
        assignedToMe: options?.assignedToMe,
        completed: options?.completed,
        closed: options?.closed,
        hasDueDate: options?.hasDueDate,
        externalIncludeDocuments: options?.externalIncludeDocuments,
        externalIncludeDoneClosed: options?.externalIncludeDoneClosed,
        externalSortBy: options?.externalSortBy,
        forTimeTracking: options?.forTimeTracking,
        includeRelationshipSummary: options?.includeRelationshipSummary,
        includeArchivedBoards: options?.includeArchivedBoards,
        includeDeleted:
          options?.includeDeleted === 'only'
            ? 'only'
            : options?.includeDeleted === true
              ? 'all'
              : undefined,
        includeCount: options?.includeCount,
      },
      cache: 'no-store',
    }
  );
}

export async function listTaskBoardStatusTemplates(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ templates: TaskBoardStatusTemplate[] }>(
    '/api/v1/task-board-status-templates',
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTask(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getCurrentUserTask(
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserTaskDialogResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function upsertCurrentUserTaskPersonalPlacement(
  taskId: string,
  payload: CurrentUserTaskPersonalPlacementPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserTaskPersonalPlacementResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}/personal-placement`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function removeCurrentUserTaskPersonalPlacement(
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}/personal-placement`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function cleanupWorkspaceTaskMentions(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/mentions/cleanup`,
    {
      method: 'POST',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTask(
  workspaceId: string,
  payload: CreateWorkspaceTaskPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskJournal(
  workspaceId: string,
  payload: CreateWorkspaceTaskJournalPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskJournalResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/journal`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskList(
  workspaceId: string,
  boardId: string,
  payload: CreateWorkspaceTaskListPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskListResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/lists`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskLists(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskListsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/lists`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskList(
  workspaceId: string,
  boardId: string,
  listId: string,
  payload: UpdateWorkspaceTaskListPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskListResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/lists/${encodePathSegment(listId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTask(
  workspaceId: string,
  taskId: string,
  payload: WorkspaceTaskUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTask(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true; message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function triggerWorkspaceTaskEmbedding(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success?: true; message?: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/embedding`,
    {
      method: 'POST',
      cache: 'no-store',
    }
  );
}

export async function moveWorkspaceTask(
  workspaceId: string,
  taskId: string,
  payload: MoveWorkspaceTaskPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<MoveWorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/move`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function bulkWorkspaceTasks(
  workspaceId: string,
  payload: {
    taskIds: string[];
    operation: BulkWorkspaceTaskOperation;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<BulkWorkspaceTasksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/bulk`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

interface WorkspaceTaskRelationshipResponse {
  relationship: TaskRelationship;
}

export async function createWorkspaceTaskRelationship(
  workspaceId: string,
  taskId: string,
  payload: CreateTaskRelationshipInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskRelationshipResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskRelationship(
  workspaceId: string,
  taskId: string,
  payload: {
    source_task_id: string;
    target_task_id: string;
    type: TaskRelationshipType;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskProject(
  workspaceId: string,
  payload: { name: string; description?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string; name: string; status?: string | null }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskProject(
  workspaceId: string,
  projectId: string,
  payload: {
    name?: string;
    description?: string | null;
    priority?: string | null;
    health_status?: string | null;
    status?: string | null;
    lead_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    archived?: boolean | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskProject>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskProject(
  workspaceId: string,
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success?: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function linkWorkspaceTaskProjectTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ linkedTask: TaskProjectLinkedItem }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId }),
      cache: 'no-store',
    }
  );
}

export async function unlinkWorkspaceTaskProjectTask(
  workspaceId: string,
  projectId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}/tasks/${encodePathSegment(taskId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskWithRelationship(
  workspaceId: string,
  payload: CreateWorkspaceTaskWithRelationshipPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CreateWorkspaceTaskWithRelationshipResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/with-relationship`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function resolveTaskProjectWorkspaceId(
  input: {
    boardId?: string | null;
    projectIds?: string[];
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ workspaceId?: string | null }>(
    '/api/v1/task-projects/resolve-workspace',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        boardId: input.boardId ?? undefined,
        projectIds: input.projectIds ?? [],
      }),
      cache: 'no-store',
    }
  );

  return payload.workspaceId ?? null;
}

export async function getWorkspaceTaskProject(
  workspaceId: string,
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskProjectWithRelations>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskProjectTasks(
  workspaceId: string,
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskProjectTasksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}/tasks`,
    {
      cache: 'no-store',
    }
  );
}

export type { RelatedTaskInfo, TaskRelationshipsResponse };
