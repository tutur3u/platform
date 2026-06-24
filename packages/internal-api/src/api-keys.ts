import type { WorkspaceApiKey, WorkspaceApiKeyUsageLog } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface WorkspaceApiKeyRole {
  id: string;
  name: string;
}

export interface ListWorkspaceApiKeysParams {
  page?: number | string;
  pageSize?: number | string;
  q?: string;
  workspaceId: string;
}

export interface ListWorkspaceApiKeysResponse {
  count: number;
  data: WorkspaceApiKey[];
}

export interface WorkspaceApiKeyResponse {
  data: WorkspaceApiKey;
}

export interface ListWorkspaceApiKeyRolesResponse {
  data: WorkspaceApiKeyRole[];
}

export interface WorkspaceApiKeyPayload {
  description?: string;
  expires_at: string | null;
  name: string;
  role_id: string | null;
}

export interface WorkspaceApiKeySecretResponse {
  key: string;
  message: string;
  prefix: string;
}

export interface WorkspaceApiKeyMutationResponse {
  message: string;
}

export interface WorkspaceApiKeyUsageLogsParams {
  endpoint?: string;
  from?: string;
  keyId: string;
  method?: string;
  page?: number | string;
  pageSize?: number | string;
  status?: string;
  to?: string;
  workspaceId: string;
}

export interface WorkspaceApiKeyUsageLogStats {
  avgResponseTime: number;
  successRate: number;
  totalRequests: number;
}

export interface ListWorkspaceApiKeyUsageLogsResponse {
  count: number;
  data: WorkspaceApiKeyUsageLog[];
  stats: WorkspaceApiKeyUsageLogStats;
}

function workspaceApiKeysPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/api-keys`;
}

function workspaceApiKeyPath(workspaceId: string, keyId: string) {
  return `${workspaceApiKeysPath(workspaceId)}/${encodePathSegment(keyId)}`;
}

export async function listWorkspaceApiKeys(
  { page = 1, pageSize = 10, q, workspaceId }: ListWorkspaceApiKeysParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceApiKeysResponse>(
    workspaceApiKeysPath(workspaceId),
    {
      cache: 'no-store',
      query: {
        page,
        pageSize,
        q: q || undefined,
      },
    }
  );
}

export async function getWorkspaceApiKey(
  workspaceId: string,
  keyId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceApiKeyResponse>(
    workspaceApiKeyPath(workspaceId, keyId),
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceApiKeyRoles(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceApiKeyRolesResponse>(
    `${workspaceApiKeysPath(workspaceId)}/roles`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceApiKey(
  workspaceId: string,
  payload: WorkspaceApiKeyPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceApiKeySecretResponse>(
    workspaceApiKeysPath(workspaceId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceApiKey(
  workspaceId: string,
  keyId: string,
  payload: Partial<WorkspaceApiKeyPayload>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceApiKeyMutationResponse>(
    workspaceApiKeyPath(workspaceId, keyId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteWorkspaceApiKey(
  workspaceId: string,
  keyId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceApiKeyMutationResponse>(
    workspaceApiKeyPath(workspaceId, keyId),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function rotateWorkspaceApiKey(
  workspaceId: string,
  keyId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceApiKeySecretResponse>(
    `${workspaceApiKeyPath(workspaceId, keyId)}/rotate`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function listWorkspaceApiKeyUsageLogs(
  {
    endpoint,
    from,
    keyId,
    method,
    page = 1,
    pageSize = 10,
    status,
    to,
    workspaceId,
  }: WorkspaceApiKeyUsageLogsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListWorkspaceApiKeyUsageLogsResponse>(
    `${workspaceApiKeyPath(workspaceId, keyId)}/usage-logs`,
    {
      cache: 'no-store',
      query: {
        endpoint: endpoint || undefined,
        from: from || undefined,
        method: method || undefined,
        page,
        pageSize,
        status: status || undefined,
        to: to || undefined,
      },
    }
  );
}
