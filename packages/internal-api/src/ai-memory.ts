import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface AiMemorySettingsResponse {
  enabled: boolean;
  productEnabled: boolean;
  products: Record<string, boolean>;
}

export interface UpdateAiMemorySettingsPayload {
  enabled: boolean;
  products?: Record<string, boolean>;
}

export interface CreateMiraMemoryPayload {
  category: string;
  confidence?: number;
  key: string;
  source?: string;
  value: string;
}

export interface AiMemoryItem {
  category?: string | null;
  content?: string | null;
  id: string;
  key?: string | null;
  metadata: Record<string, unknown> | null;
  score?: number;
  status?: string;
  summary?: string | null;
  title?: string | null;
  updatedAt: string;
  value?: string;
}

export interface ListAiMemoryItemsResponse {
  items: AiMemoryItem[];
  product: string;
  total: number;
}

export interface ExportAiMemoryItemsResponse extends ListAiMemoryItemsResponse {
  exportedAt: string;
}

export interface CreateMiraMemoryResponse<TMemory = unknown> {
  memory: TMemory;
}

export interface CreateWorkspaceAiMemoryItemPayload {
  category?: string;
  key?: string;
  product?: string;
  source?: string;
  value: string;
}

export interface CreateWorkspaceAiMemoryItemResponse<TMemory = unknown> {
  memory: TMemory | null;
  product: string;
  reason?: string;
  skipped: boolean;
}

export async function createMiraMemory<TMemory = unknown>(
  wsId: string,
  payload: CreateMiraMemoryPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CreateMiraMemoryResponse<TMemory>>(
    '/api/v1/mira/memories',
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      query: { wsId },
    }
  );
}

export async function getWorkspaceAiMemorySettings(
  wsId: string,
  options?: InternalApiClientOptions & { product?: string }
) {
  return getInternalApiClient(options).json<AiMemorySettingsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/settings`,
    {
      query: { product: options?.product },
    }
  );
}

export async function updateWorkspaceAiMemorySettings(
  wsId: string,
  payload: UpdateAiMemorySettingsPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<AiMemorySettingsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/settings`,
    {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function listWorkspaceAiMemoryItems(
  wsId: string,
  options?: InternalApiClientOptions & {
    category?: string;
    limit?: number;
    product?: string;
    q?: string;
  }
) {
  return getInternalApiClient(options).json<ListAiMemoryItemsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/items`,
    {
      query: {
        category: options?.category,
        limit: options?.limit,
        product: options?.product,
        q: options?.q,
      },
    }
  );
}

export async function createWorkspaceAiMemoryItem<TMemory = unknown>(
  wsId: string,
  payload: CreateWorkspaceAiMemoryItemPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<
    CreateWorkspaceAiMemoryItemResponse<TMemory>
  >(`/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/items`, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function deleteWorkspaceAiMemoryItem(
  wsId: string,
  memoryId: string,
  options?: InternalApiClientOptions & { product?: string }
) {
  return getInternalApiClient(options).json<{
    deleted: boolean;
    reason: string | null;
  }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/items/${encodePathSegment(memoryId)}`,
    {
      method: 'DELETE',
      query: { product: options?.product },
    }
  );
}

export async function exportWorkspaceAiMemoryItems(
  wsId: string,
  options?: InternalApiClientOptions & { product?: string }
) {
  return getInternalApiClient(options).json<ExportAiMemoryItemsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/ai/memory/export`,
    {
      method: 'POST',
      query: { product: options?.product },
    }
  );
}
