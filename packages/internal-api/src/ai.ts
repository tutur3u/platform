import type { AIModelUI } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface InternalAiChatSummary {
  id: string;
  title: string | null;
  created_at: string;
  pinned?: boolean | null;
  is_public?: boolean | null;
  model?: string | null;
}

export interface GenerateWorkspaceCourseModulesFromStoragePayload {
  fileName?: string;
  groupId: string;
  maxCharacters?: number;
  storagePath: string;
}

export interface GeneratedWorkspaceCourseModule {
  id: string;
  name?: string | null;
  content?: string | null;
  sort_key?: number | null;
}

export interface GenerateWorkspaceCourseModulesFromStorageResponse {
  data: unknown;
  createdModules: GeneratedWorkspaceCourseModule[] | null;
  metadata?: {
    title?: string | null;
    creditsCharged?: number;
    truncated?: boolean;
  };
}

type GatewayModelRow = {
  context_window?: number | null;
  description?: string | null;
  id: string;
  is_enabled?: boolean | null;
  name?: string | null;
  provider?: string | null;
  tags?: string[] | null;
};

export function mapGatewayModelToUi(model: GatewayModelRow): AIModelUI {
  return {
    context: model.context_window ?? undefined,
    description: model.description ?? undefined,
    disabled: model.is_enabled === false,
    label:
      model.name?.trim() || model.id.split('/').slice(1).join('/') || model.id,
    provider: model.provider || model.id.split('/')[0] || 'unknown',
    tags: Array.isArray(model.tags) ? model.tags : undefined,
    value: model.id,
  };
}

export async function listAiGatewayModels(
  options?: InternalApiClientOptions & {
    enabled?: boolean;
    type?: 'all' | 'embedding' | 'image' | 'language' | 'other';
  }
) {
  const { enabled = true, type = 'language', ...clientOptions } = options ?? {};
  const client = getInternalApiClient(clientOptions);
  const rows = await client.json<GatewayModelRow[]>(
    '/api/v1/infrastructure/ai/models',
    {
      cache: 'no-store',
      query: { enabled, type },
    }
  );

  return rows.map(mapGatewayModelToUi);
}

export async function listWorkspaceAiModelFavorites(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ favoriteIds: string[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/model-favorites`,
    {
      cache: 'no-store',
    }
  );

  return payload.favoriteIds ?? [];
}

export async function toggleWorkspaceAiModelFavorite(
  workspaceId: string,
  payload: { modelId: string; isFavorited: boolean },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/model-favorites`,
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

export async function listCurrentUserAiChats(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InternalAiChatSummary[]>('/api/v1/ai/chats', {
    cache: 'no-store',
  });
}

export async function updateAiChat(
  chatId: string,
  payload: Partial<
    Pick<InternalAiChatSummary, 'is_public' | 'title' | 'pinned'>
  >,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/ai/chats/${encodePathSegment(chatId)}`,
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

export async function generateWorkspaceCourseModulesFromStorage(
  workspaceId: string,
  payload: GenerateWorkspaceCourseModulesFromStoragePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<GenerateWorkspaceCourseModulesFromStorageResponse>(
    '/api/ai/course',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        wsId: workspaceId,
        ...payload,
      }),
      cache: 'no-store',
    }
  );
}
