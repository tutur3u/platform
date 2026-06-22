import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type TaskPlanPeriod = 'week' | 'month' | 'year';
export type TaskPlanStatus = 'draft' | 'active' | 'sent' | 'archived';
export type TaskPlanPermission = 'view' | 'edit';
export type TaskPlanItemStatus =
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'removed';

export interface TaskPlanSchemaUnavailableResponse {
  ok: false;
  code: 'schema_unavailable';
  schemaAvailable: false;
  message: string;
  [key: string]: unknown;
}

export interface TaskPlanWorkspace {
  plan_id: string;
  ws_id: string;
  created_at?: string | null;
}

export interface TaskPlanShare {
  id: string;
  plan_id: string;
  shared_with_ws_id: string | null;
  shared_with_user_id: string | null;
  shared_with_email: string | null;
  permission: TaskPlanPermission;
  shared_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface TaskPlanItemTaskSummary {
  id: string;
  name: string;
  priority?: string | null;
  end_date?: string | null;
  completed_at?: string | null;
  closed_at?: string | null;
}

export interface TaskPlanItem {
  id: string;
  plan_id: string;
  task_id: string | null;
  target_ws_id: string | null;
  target_board_id: string | null;
  target_list_id: string | null;
  planned_start: string | null;
  planned_end: string | null;
  sort_key: number;
  status: TaskPlanItemStatus;
  notes: string | null;
  snapshot_title: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  task?: TaskPlanItemTaskSummary | null;
}

export interface TaskPlan {
  id: string;
  owner_id: string;
  personal_ws_id: string;
  title: string;
  period_type: TaskPlanPeriod;
  period_start: string;
  period_end: string;
  timezone: string;
  status: TaskPlanStatus;
  default_target_ws_id: string | null;
  default_target_board_id: string | null;
  default_target_list_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  workspaces?: TaskPlanWorkspace[];
  items?: TaskPlanItem[];
  shares?: TaskPlanShare[];
}

export interface CreateTaskPlanPayload {
  title: string;
  period_type: TaskPlanPeriod;
  period_start: string;
  period_end: string;
  timezone?: string;
  status?: TaskPlanStatus;
  default_target_ws_id?: string | null;
  default_target_board_id?: string | null;
  default_target_list_id?: string | null;
  intended_workspace_ids?: string[];
}

export type UpdateTaskPlanPayload = Partial<CreateTaskPlanPayload> & {
  archived_at?: string | null;
};

export interface CreateTaskPlanItemPayload {
  task_id?: string | null;
  target_ws_id?: string | null;
  target_board_id?: string | null;
  target_list_id?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  sort_key?: number;
  status?: TaskPlanItemStatus;
  notes?: string | null;
  snapshot_title?: string | null;
  source_task?: {
    name: string;
    description?: string | null;
    listId: string;
    priority?: 'low' | 'normal' | 'high' | 'critical' | null;
    start_date?: string | null;
    end_date?: string | null;
    estimation_points?: number | null;
    label_ids?: string[];
    project_ids?: string[];
    assignee_ids?: string[];
  };
}

export type UpdateTaskPlanItemPayload = Partial<CreateTaskPlanItemPayload> & {
  item_id: string;
};

export type CreateTaskPlanSharePayload =
  | {
      shared_with_ws_id: string;
      shared_with_user_id?: never;
      shared_with_email?: never;
      permission?: TaskPlanPermission;
    }
  | {
      shared_with_user_id: string;
      shared_with_ws_id?: never;
      shared_with_email?: never;
      permission?: TaskPlanPermission;
    }
  | {
      shared_with_email: string;
      shared_with_ws_id?: never;
      shared_with_user_id?: never;
      permission?: TaskPlanPermission;
    };

export type ListTaskPlansResponse =
  | {
      ok: true;
      schemaAvailable: true;
      plans: TaskPlan[];
    }
  | (TaskPlanSchemaUnavailableResponse & { plans?: TaskPlan[] });

export type TaskPlanResponse =
  | {
      ok: true;
      schemaAvailable: true;
      plan: TaskPlan;
    }
  | TaskPlanSchemaUnavailableResponse;

export type TaskPlanWorkspacesResponse =
  | {
      ok: true;
      schemaAvailable: true;
      workspaces: TaskPlanWorkspace[];
    }
  | (TaskPlanSchemaUnavailableResponse & { workspaces?: TaskPlanWorkspace[] });

export type TaskPlanSharesResponse =
  | {
      ok: true;
      schemaAvailable: true;
      shares: TaskPlanShare[];
    }
  | (TaskPlanSchemaUnavailableResponse & { shares?: TaskPlanShare[] });

export type TaskPlanItemsResponse =
  | {
      ok: true;
      schemaAvailable: true;
      items: TaskPlanItem[];
    }
  | (TaskPlanSchemaUnavailableResponse & { items?: TaskPlanItem[] });

export type TaskPlanItemResponse =
  | {
      ok: true;
      schemaAvailable: true;
      item: TaskPlanItem;
      task?: unknown;
    }
  | TaskPlanSchemaUnavailableResponse;

export type TaskPlanDigestResponse =
  | {
      ok: true;
      schemaAvailable: true;
      digest: string;
      itemCount: number;
    }
  | (TaskPlanSchemaUnavailableResponse & { digest?: string });

function planBasePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-plans`;
}

function planPath(workspaceId: string, planId: string) {
  return `${planBasePath(workspaceId)}/${encodePathSegment(planId)}`;
}

export function isTaskPlanSchemaUnavailable(
  response: unknown
): response is TaskPlanSchemaUnavailableResponse {
  return (
    Boolean(response) &&
    typeof response === 'object' &&
    (response as { code?: unknown }).code === 'schema_unavailable'
  );
}

export async function listWorkspaceTaskPlans(
  workspaceId: string,
  query?: { period_type?: TaskPlanPeriod; status?: TaskPlanStatus },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ListTaskPlansResponse>(planBasePath(workspaceId), {
    cache: 'no-store',
    query,
  });
}

export async function createWorkspaceTaskPlan(
  workspaceId: string,
  payload: CreateTaskPlanPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanResponse>(planBasePath(workspaceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export async function getWorkspaceTaskPlan(
  workspaceId: string,
  planId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanResponse>(planPath(workspaceId, planId), {
    cache: 'no-store',
  });
}

export async function updateWorkspaceTaskPlan(
  workspaceId: string,
  planId: string,
  payload: UpdateTaskPlanPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanResponse>(planPath(workspaceId, planId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export async function deleteWorkspaceTaskPlan(
  workspaceId: string,
  planId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ ok: true } | TaskPlanSchemaUnavailableResponse>(
    planPath(workspaceId, planId),
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function addWorkspaceTaskPlanWorkspace(
  workspaceId: string,
  planId: string,
  targetWorkspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<
    | { ok: true; schemaAvailable: true; workspace: TaskPlanWorkspace }
    | TaskPlanSchemaUnavailableResponse
  >(`${planPath(workspaceId, planId)}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ws_id: targetWorkspaceId }),
    cache: 'no-store',
  });
}

export async function removeWorkspaceTaskPlanWorkspace(
  workspaceId: string,
  planId: string,
  targetWorkspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ ok: true } | TaskPlanSchemaUnavailableResponse>(
    `${planPath(workspaceId, planId)}/workspaces`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ws_id: targetWorkspaceId }),
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskPlanShares(
  workspaceId: string,
  planId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanSharesResponse>(
    `${planPath(workspaceId, planId)}/shares`,
    { cache: 'no-store' }
  );
}

export async function createWorkspaceTaskPlanShare(
  workspaceId: string,
  planId: string,
  payload: CreateTaskPlanSharePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<
    | { ok: true; schemaAvailable: true; share: TaskPlanShare }
    | TaskPlanSchemaUnavailableResponse
  >(`${planPath(workspaceId, planId)}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

export async function updateWorkspaceTaskPlanShare(
  workspaceId: string,
  planId: string,
  shareId: string,
  permission: TaskPlanPermission,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<
    | { ok: true; schemaAvailable: true; share: TaskPlanShare }
    | TaskPlanSchemaUnavailableResponse
  >(`${planPath(workspaceId, planId)}/shares`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ share_id: shareId, permission }),
    cache: 'no-store',
  });
}

export async function deleteWorkspaceTaskPlanShare(
  workspaceId: string,
  planId: string,
  shareId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ ok: true } | TaskPlanSchemaUnavailableResponse>(
    `${planPath(workspaceId, planId)}/shares`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_id: shareId }),
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTaskPlanItems(
  workspaceId: string,
  planId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanItemsResponse>(
    `${planPath(workspaceId, planId)}/items`,
    { cache: 'no-store' }
  );
}

export async function createWorkspaceTaskPlanItem(
  workspaceId: string,
  planId: string,
  payload: CreateTaskPlanItemPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanItemResponse>(
    `${planPath(workspaceId, planId)}/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskPlanItem(
  workspaceId: string,
  planId: string,
  payload: UpdateTaskPlanItemPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanItemResponse>(
    `${planPath(workspaceId, planId)}/items`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskPlanItem(
  workspaceId: string,
  planId: string,
  itemId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ ok: true } | TaskPlanSchemaUnavailableResponse>(
    `${planPath(workspaceId, planId)}/items`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskPlanDigest(
  workspaceId: string,
  planId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskPlanDigestResponse>(
    `${planPath(workspaceId, planId)}/digest`,
    { cache: 'no-store' }
  );
}
