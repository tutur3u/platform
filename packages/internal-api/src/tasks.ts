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

export interface InternalApiWorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  ws_id: string;
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
  q?: string;
  identifier?: string;
  limit?: number;
  offset?: number;
  includeRelationshipSummary?: boolean;
  includeDeleted?: boolean | 'only';
  includeCount?: boolean;
}

export interface WorkspaceTasksResponse {
  tasks: WorkspaceTaskApiTask[];
  count?: number;
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
}

export interface ListWorkspaceTaskBoardsResponse {
  boards: WorkspaceTaskBoardListItem[];
  count: number;
}

export interface WorkspaceBoardsDataResponse {
  data: WorkspaceTaskBoardDetail[];
  count: number;
}

export type CreateWorkspaceTaskBoardPayload = Pick<
  Database['public']['Tables']['workspace_boards']['Insert'],
  'name' | 'icon' | 'template_id'
>;

export type UpdateWorkspaceTaskBoardPayload = Pick<
  Database['public']['Tables']['workspace_boards']['Update'],
  'name' | 'icon' | 'ticket_prefix'
> & {
  color?: string;
  archived?: boolean;
  group_ids?: string[];
};

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

export interface WorkspaceTaskBoardResponse {
  board: Pick<
    WorkspaceTaskBoardRow,
    'id' | 'ws_id' | 'name' | 'icon' | 'template_id' | 'created_at'
  >;
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
        q: options?.q,
        identifier: options?.identifier,
        limit: options?.limit,
        offset: options?.offset,
        includeRelationshipSummary: options?.includeRelationshipSummary,
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
  return client.json<{ tasks: Task[]; lists: TaskList[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}/tasks`,
    {
      cache: 'no-store',
    }
  );
}

export type { RelatedTaskInfo, TaskRelationshipsResponse };
