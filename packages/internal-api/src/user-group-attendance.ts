import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import {
  type ListWorkspaceUserGroupMembersParams,
  type ListWorkspaceUserGroupMembersResponse,
  listWorkspaceUserGroupMembers,
} from './user-group-schedule';
import {
  ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
  getOptionalWorkspaceConfig,
} from './workspace-configs';

export type WorkspaceUserGroupAttendanceStatus =
  | 'ABSENT'
  | 'LATE'
  | 'NONE'
  | 'PRESENT';

export interface WorkspaceUserGroupAttendanceRecord {
  id: string;
  notes: string | null;
  session_id: string | null;
  status: WorkspaceUserGroupAttendanceStatus | string;
  user_id: string;
}

export interface ListWorkspaceUserGroupAttendanceParams {
  date: string;
  sessionId?: string | null;
}

export interface SaveWorkspaceUserGroupAttendanceEntry {
  date: string;
  notes?: string | null;
  session_id?: string | null;
  status: WorkspaceUserGroupAttendanceStatus;
  user_id: string;
}

export interface SaveWorkspaceUserGroupAttendanceResponse {
  message: string;
}

function userGroupPath(workspaceId: string, groupId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}`;
}

export function listWorkspaceUserGroupAttendanceMembers(
  workspaceId: string,
  groupId: string,
  params: ListWorkspaceUserGroupMembersParams = {},
  options?: InternalApiClientOptions
): Promise<ListWorkspaceUserGroupMembersResponse> {
  return listWorkspaceUserGroupMembers(workspaceId, groupId, params, options);
}

export function listWorkspaceUserGroupAttendance(
  workspaceId: string,
  groupId: string,
  params: ListWorkspaceUserGroupAttendanceParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceUserGroupAttendanceRecord[]>(
    `${userGroupPath(workspaceId, groupId)}/attendance`,
    {
      cache: 'no-store',
      query: {
        date: params.date,
        sessionId: params.sessionId,
      },
    }
  );
}

export function saveWorkspaceUserGroupAttendance(
  workspaceId: string,
  groupId: string,
  entries: SaveWorkspaceUserGroupAttendanceEntry[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<SaveWorkspaceUserGroupAttendanceResponse>(
    `${userGroupPath(workspaceId, groupId)}/attendance`,
    {
      body: JSON.stringify(entries),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function getWorkspaceUserGroupAttendanceShowManagers(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const config = await getOptionalWorkspaceConfig(
    workspaceId,
    ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
    options
  );

  return parseWorkspaceUserGroupAttendanceShowManagers(config?.value);
}

/** A missing setting preserves the existing default-on workspace behavior. */
export function parseWorkspaceUserGroupAttendanceShowManagers(
  value: string | null | undefined
): boolean {
  return value?.trim().toLowerCase() !== 'false';
}

/** Keep the parsed boolean separate from the raw workspace config query cache. */
export function workspaceUserGroupAttendanceShowManagersQueryKey(
  workspaceId: string
) {
  return ['attendance-show-managers', workspaceId] as const;
}

/** Use the same manager rule in every attendance-taking client. */
export function filterWorkspaceUserGroupAttendanceMembers<
  T extends { role?: string | null },
>(members: T[], showManagers: boolean): T[] {
  return showManagers
    ? members
    : members.filter((member) => member.role !== 'TEACHER');
}
