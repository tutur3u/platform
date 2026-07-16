import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
  withTaskApiBaseUrl,
} from '@tuturuuu/internal-api/client';
import type {
  CreateTaskLeaderboardMemberPayload,
  CreateTaskLeaderboardPayload,
  CreateTaskLeaderboardTeamPayload,
  CreateTaskProgressEntryPayload,
  CreateTaskProgressGoalPayload,
  CreateTaskProgressMetricPayload,
  JoinTaskLeaderboardResponse,
  LeaveTaskLeaderboardResponse,
  SchemaUnavailableResponse,
  TaskLeaderboardMember,
  TaskLeaderboardResponse,
  TaskLeaderboardsResponse,
  TaskLeaderboardTeam,
  TaskProgressAchievementsResponse,
  TaskProgressCatchupPeriod,
  TaskProgressCatchupResponse,
  TaskProgressEntriesResponse,
  TaskProgressEntryResponse,
  TaskProgressGoalResponse,
  TaskProgressGoalsResponse,
  TaskProgressImportResponse,
  TaskProgressMetricPackResponse,
  TaskProgressMetricResponse,
  TaskProgressMetricsResponse,
  TaskProgressStatsResponse,
  UpdateTaskLeaderboardPayload,
  UpdateTaskProgressEntryPayload,
  UpdateTaskProgressGoalPayload,
  UpdateTaskProgressMetricPayload,
} from './types';

export type * from './types';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

function progressBasePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-progress`;
}

function jsonInit(method: string, payload?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  };
}

export function isTaskProgressSchemaUnavailable(
  response: unknown
): response is SchemaUnavailableResponse {
  return (
    Boolean(response) &&
    typeof response === 'object' &&
    (response as { code?: unknown }).code === 'schema_unavailable'
  );
}

export function listTaskProgressMetrics(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressMetricsResponse>(
    `${progressBasePath(workspaceId)}/metrics`,
    { cache: 'no-store' }
  );
}

export function createTaskProgressMetric(
  workspaceId: string,
  payload: CreateTaskProgressMetricPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressMetricResponse>(
    `${progressBasePath(workspaceId)}/metrics`,
    jsonInit('POST', payload)
  );
}

export function updateTaskProgressMetric(
  workspaceId: string,
  metricId: string,
  payload: UpdateTaskProgressMetricPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressMetricResponse>(
    `${progressBasePath(workspaceId)}/metrics/${encodePathSegment(metricId)}`,
    jsonInit('PATCH', payload)
  );
}

export function deleteTaskProgressMetric(
  workspaceId: string,
  metricId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ ok: true }>(
    `${progressBasePath(workspaceId)}/metrics/${encodePathSegment(metricId)}`,
    jsonInit('DELETE')
  );
}

export function listTaskProgressEntries(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressEntriesResponse>(
    `${progressBasePath(workspaceId)}/entries`,
    { cache: 'no-store', query }
  );
}

export function createTaskProgressEntry(
  workspaceId: string,
  payload: CreateTaskProgressEntryPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressEntryResponse>(
    `${progressBasePath(workspaceId)}/entries`,
    jsonInit('POST', payload)
  );
}

export function updateTaskProgressEntry(
  workspaceId: string,
  entryId: string,
  payload: UpdateTaskProgressEntryPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressEntryResponse>(
    `${progressBasePath(workspaceId)}/entries/${encodePathSegment(entryId)}`,
    jsonInit('PATCH', payload)
  );
}

export function deleteTaskProgressEntry(
  workspaceId: string,
  entryId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ ok: true }>(
    `${progressBasePath(workspaceId)}/entries/${encodePathSegment(entryId)}`,
    jsonInit('DELETE')
  );
}

export function listTaskProgressGoals(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressGoalsResponse>(
    `${progressBasePath(workspaceId)}/goals`,
    { cache: 'no-store', query }
  );
}

export function createTaskProgressGoal(
  workspaceId: string,
  payload: CreateTaskProgressGoalPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressGoalResponse>(
    `${progressBasePath(workspaceId)}/goals`,
    jsonInit('POST', payload)
  );
}

export function updateTaskProgressGoal(
  workspaceId: string,
  goalId: string,
  payload: UpdateTaskProgressGoalPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressGoalResponse>(
    `${progressBasePath(workspaceId)}/goals/${encodePathSegment(goalId)}`,
    jsonInit('PATCH', payload)
  );
}

export function deleteTaskProgressGoal(
  workspaceId: string,
  goalId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ ok: true }>(
    `${progressBasePath(workspaceId)}/goals/${encodePathSegment(goalId)}`,
    jsonInit('DELETE')
  );
}

export function getTaskProgressStats(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<
    TaskProgressStatsResponse | SchemaUnavailableResponse
  >(`${progressBasePath(workspaceId)}/stats`, {
    cache: 'no-store',
    query,
  });
}

export function generateTaskProgressCatchup(
  workspaceId: string,
  payload: {
    force?: boolean;
    locale?: string;
    period: TaskProgressCatchupPeriod;
  },
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressCatchupResponse>(
    `${progressBasePath(workspaceId)}/catchup`,
    jsonInit('POST', payload)
  );
}

export function listTaskLeaderboards(
  workspaceId: string,
  query?: InternalApiQuery,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskLeaderboardsResponse>(
    `${progressBasePath(workspaceId)}/leaderboards`,
    { cache: 'no-store', query }
  );
}

export function createTaskLeaderboard(
  workspaceId: string,
  payload: CreateTaskLeaderboardPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskLeaderboardResponse>(
    `${progressBasePath(workspaceId)}/leaderboards`,
    jsonInit('POST', payload)
  );
}

export function updateTaskLeaderboard(
  workspaceId: string,
  leaderboardId: string,
  payload: UpdateTaskLeaderboardPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskLeaderboardResponse>(
    `${progressBasePath(workspaceId)}/leaderboards/${encodePathSegment(
      leaderboardId
    )}`,
    jsonInit('PATCH', payload)
  );
}

export function deleteTaskLeaderboard(
  workspaceId: string,
  leaderboardId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{ ok: true }>(
    `${progressBasePath(workspaceId)}/leaderboards/${encodePathSegment(
      leaderboardId
    )}`,
    jsonInit('DELETE')
  );
}

export function createTaskLeaderboardTeam(
  workspaceId: string,
  leaderboardId: string,
  payload: CreateTaskLeaderboardTeamPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{
    ok: true;
    schemaAvailable: true;
    team: TaskLeaderboardTeam;
  }>(
    `${progressBasePath(workspaceId)}/leaderboards/${encodePathSegment(
      leaderboardId
    )}/teams`,
    jsonInit('POST', payload)
  );
}

export function addTaskLeaderboardMember(
  workspaceId: string,
  leaderboardId: string,
  payload: CreateTaskLeaderboardMemberPayload,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<{
    ok: true;
    schemaAvailable: true;
    member: TaskLeaderboardMember;
  }>(
    `${progressBasePath(workspaceId)}/leaderboards/${encodePathSegment(
      leaderboardId
    )}/members`,
    jsonInit('POST', payload)
  );
}

export function importTaskProgressEntries(
  workspaceId: string,
  payload: { commit?: boolean; entries: CreateTaskProgressEntryPayload[] },
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressImportResponse>(
    `${progressBasePath(workspaceId)}/import`,
    jsonInit('POST', payload)
  );
}

export function getTaskProgressAchievements(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressAchievementsResponse>(
    `${progressBasePath(workspaceId)}/achievements`,
    { cache: 'no-store' }
  );
}

export function applyTaskProgressMetricPack(
  workspaceId: string,
  payload: { pack?: string },
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<TaskProgressMetricPackResponse>(
    `${progressBasePath(workspaceId)}/metrics/pack`,
    jsonInit('POST', payload)
  );
}

export function joinTaskLeaderboard(
  workspaceId: string,
  payload: { join_code: string; display_name?: string | null },
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<JoinTaskLeaderboardResponse>(
    `${progressBasePath(workspaceId)}/leaderboards/join`,
    jsonInit('POST', payload)
  );
}

export function leaveTaskLeaderboard(
  workspaceId: string,
  payload: { join_code: string },
  options?: InternalApiClientOptions
) {
  return getTaskApiClient(options).json<LeaveTaskLeaderboardResponse>(
    `${progressBasePath(workspaceId)}/leaderboards/join`,
    jsonInit('DELETE', payload)
  );
}
