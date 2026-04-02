import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export interface WorkspaceUserAuditEventResponse {
  auditRecordId: number;
  eventKind:
    | 'created'
    | 'updated'
    | 'archived'
    | 'reactivated'
    | 'archive_until_changed'
    | 'deleted';
  summary: string;
  changedFields: string[];
  fieldChanges: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>;
  before: Record<string, string | null>;
  after: Record<string, string | null>;
  affectedUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  actor: {
    authUid: string | null;
    workspaceUserId: string | null;
    id: string | null;
    name: string | null;
    email: string | null;
  };
  occurredAt: string;
  source: 'live' | 'backfilled';
}

export interface WorkspaceUserAuditLogsResponse {
  data: WorkspaceUserAuditEventResponse[];
  count: number;
}

export interface WorkspaceUserAuditLogQuery extends InternalApiQuery {
  start: string;
  end: string;
  eventKind?:
    | 'created'
    | 'updated'
    | 'archived'
    | 'reactivated'
    | 'archive_until_changed'
    | 'deleted'
    | 'all';
  source?: 'live' | 'backfilled' | 'all';
  affectedUserQuery?: string;
  actorQuery?: string;
  offset?: number;
  limit?: number;
}

export interface BackfillWorkspaceUserStatusChangesPayload {
  dryRun?: boolean;
  limit?: number;
}

export interface BackfillWorkspaceUserStatusChangesResponse {
  rows: Array<{
    audit_record_version_id: number;
    user_id: string;
    ws_id: string;
    archived: boolean;
    archived_until: string | null;
    actor_auth_uid: string | null;
    creator_id: string | null;
    source: 'backfilled' | 'live';
    created_at: string;
    event_kind: 'archived' | 'reactivated' | 'archive_until_changed';
  }>;
  count: number;
  dryRun: boolean;
}

export async function listWorkspaceUserAuditLogs(
  workspaceId: string,
  query: WorkspaceUserAuditLogQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceUserAuditLogsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/audit-logs`,
    {
      cache: 'no-store',
      query,
    }
  );
}

export async function backfillWorkspaceUserStatusChanges(
  workspaceId: string,
  payload: BackfillWorkspaceUserStatusChangesPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<BackfillWorkspaceUserStatusChangesResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/audit-logs/backfill`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}
