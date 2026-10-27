import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

export type BoardSprintStatus =
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled';
export type BoardSprintGoalResult = 'met' | 'partly' | 'missed';
export type BoardSprintEndDecision = 'carry' | 'backlog';
export type BoardSprintLengthWeeks = 1 | 2;

export interface BoardSprintTask {
  task_id: string;
  added_after_start: boolean;
  carry_count: number;
  end_decision: BoardSprintEndDecision | null;
}

export interface BoardSprintReportPerson {
  user_id: string;
  total_tasks: number;
  done_tasks: number;
  total_points: number;
  done_points: number;
}

export interface BoardSprintReport {
  ended_at: string;
  ended_by: string | null;
  next_cycle_id: string | null;
  goal: string | null;
  goal_result: BoardSprintGoalResult | null;
  total_tasks: number;
  done_tasks: number;
  added_tasks: number;
  carried_in_tasks: number;
  carried_tasks: number;
  backlog_tasks: number;
  committed_points: number;
  done_points: number;
  added_points: number;
  people: BoardSprintReportPerson[];
}

export interface BoardSprint {
  id: string;
  name: string;
  sequence_number: number;
  status: BoardSprintStatus;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
  goal_result: BoardSprintGoalResult | null;
  started_at: string | null;
  ended_at: string | null;
  tasks: BoardSprintTask[];
  report: BoardSprintReport | null;
}

export interface BoardSprintsResponse {
  schemaAvailable: boolean;
  sprintLengthWeeks: BoardSprintLengthWeeks | null;
  sprints: BoardSprint[];
}

export interface UpdateBoardSprintPayload {
  goal?: string | null;
  goal_result?: BoardSprintGoalResult | null;
}

export interface EndBoardSprintPayload {
  decisions?: Record<string, BoardSprintEndDecision>;
  goal_result?: BoardSprintGoalResult | null;
}

function sprintsPath(workspaceId: string, boardId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-boards/${encodePathSegment(boardId)}/sprints`;
}

function sprintPath(workspaceId: string, boardId: string, sprintId: string) {
  return `${sprintsPath(workspaceId, boardId)}/${encodePathSegment(sprintId)}`;
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  };
}

export async function listWorkspaceTaskBoardSprints(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<BoardSprintsResponse>(
    sprintsPath(workspaceId, boardId),
    { cache: 'no-store' }
  );
}

export async function updateWorkspaceTaskBoardSprintLength(
  workspaceId: string,
  boardId: string,
  sprintLengthWeeks: BoardSprintLengthWeeks | null,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<BoardSprintsResponse>(
    sprintsPath(workspaceId, boardId),
    jsonRequest('PUT', { sprint_length_weeks: sprintLengthWeeks })
  );
}

export async function updateWorkspaceTaskBoardSprint(
  workspaceId: string,
  boardId: string,
  sprintId: string,
  payload: UpdateBoardSprintPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ sprint: BoardSprint }>(
    sprintPath(workspaceId, boardId, sprintId),
    jsonRequest('PATCH', payload)
  );
}

export async function startWorkspaceTaskBoardSprint(
  workspaceId: string,
  boardId: string,
  sprintId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<BoardSprintsResponse>(
    `${sprintPath(workspaceId, boardId, sprintId)}/start`,
    jsonRequest('POST', {})
  );
}

export async function endWorkspaceTaskBoardSprint(
  workspaceId: string,
  boardId: string,
  sprintId: string,
  payload: EndBoardSprintPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<
    BoardSprintsResponse & { report: BoardSprintReport }
  >(
    `${sprintPath(workspaceId, boardId, sprintId)}/end`,
    jsonRequest('POST', payload)
  );
}

export async function moveTasksToWorkspaceTaskBoardSprint(
  workspaceId: string,
  boardId: string,
  sprintId: string,
  taskIds: string[],
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ moved: number }>(
    `${sprintPath(workspaceId, boardId, sprintId)}/tasks`,
    jsonRequest('POST', { task_ids: taskIds })
  );
}
