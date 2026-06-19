import type { AIModelUI } from '@tuturuuu/types';
import type { ChatMessage } from '../chat-types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';
import type {
  AIWhitelistDomainResponse,
  AIWhitelistDomainsResponse,
  AIWhitelistEmailResponse,
  AIWhitelistEmailsResponse,
  AiAgentDeployResponse,
  AiAgentExternalDraftResponse,
  AiAgentExternalMessagesResponse,
  AiAgentExternalSyncResponse,
  AiAgentExternalThreadsResponse,
  AiAgentIdentityLink,
  AiAgentsResponse,
  AiAgentTestResponse,
  AiAgentZaloPersonalAction,
  AiAgentZaloPersonalActionResponse,
  AiAgentZaloPersonalQrLoginResponse,
  AiAgentZaloPersonalStatusResponse,
  AiGatewayModelsPage,
  CreateAIWhitelistDomainPayload,
  CreateAIWhitelistEmailPayload,
  CreateChatIntegrationPayload,
  CreateChatIntegrationResponse,
  GatewayModelRow,
  ListAIWhitelistDomainsParams,
  ListAIWhitelistEmailsParams,
  ListAiGatewayModelsPageParams,
  ListAiGatewayModelsParams,
  RotateAiAgentChannelSecretResponse,
  SaveAiAgentIdentityResponse,
  SaveAiAgentPayload,
  SaveAiAgentResponse,
  UpdateAIWhitelistDomainPayload,
  UpdateAIWhitelistEmailPayload,
} from './types';

function mapGatewayModel(model: GatewayModelRow): AIModelUI {
  return {
    context: model.context_window ?? undefined,
    description: model.description ?? undefined,
    disabled: !model.is_enabled,
    label: model.name,
    provider: model.provider,
    tags: model.tags ?? undefined,
    value: model.id,
  };
}

export async function listAiGatewayModels(
  params?: ListAiGatewayModelsParams,
  options?: InternalApiClientOptions
) {
  return listAiGatewayModelsLegacy(params, options);
}

export async function listAiGatewayModelsPage(
  params?: ListAiGatewayModelsPageParams,
  options?: InternalApiClientOptions
): Promise<AiGatewayModelsPage> {
  const client = getInternalApiClient(options);
  const response = await client.json<{
    data: GatewayModelRow[];
    pagination: AiGatewayModelsPage['pagination'];
  }>('/api/v1/infrastructure/ai/models', {
    cache: 'no-store',
    query: {
      enabled:
        typeof params?.enabled === 'boolean'
          ? String(params.enabled)
          : undefined,
      format: 'paginated',
      ids: params?.ids?.join(','),
      limit: params?.limit,
      page: params?.page,
      provider: params?.provider,
      q: params?.q,
      tag: params?.tag,
      type: params?.type ?? 'language',
    },
  });

  return {
    data: response.data.map((row) => mapGatewayModel(row)),
    pagination: response.pagination,
  };
}

export async function listAiGatewayModelsLegacy(
  params?: ListAiGatewayModelsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const rows = await client.json<GatewayModelRow[]>(
    '/api/v1/infrastructure/ai/models',
    {
      cache: 'no-store',
      query: {
        enabled:
          typeof params?.enabled === 'boolean'
            ? String(params.enabled)
            : undefined,
        ids: params?.ids?.join(','),
        provider: params?.provider,
        q: params?.q,
        tag: params?.tag,
        type: params?.type ?? 'language',
      },
    }
  );

  return rows.map((row) => mapGatewayModel(row));
}

export async function listAIWhitelistDomains(
  params?: ListAIWhitelistDomainsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistDomainsResponse>(
    '/api/v1/infrastructure/ai/whitelist/domains',
    {
      cache: 'no-store',
      query: {
        page: params?.page,
        pageSize: params?.pageSize,
        q: params?.q,
      },
    }
  );
}

export async function createAIWhitelistDomain(
  payload: CreateAIWhitelistDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistDomainResponse>(
    '/api/v1/infrastructure/ai/whitelist/domains',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateAIWhitelistDomain(
  domain: string,
  payload: UpdateAIWhitelistDomainPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/domain/${encodePathSegment(domain)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteAIWhitelistDomain(
  domain: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/domain/${encodePathSegment(domain)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listAIWhitelistEmails(
  params?: ListAIWhitelistEmailsParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistEmailsResponse>(
    '/api/v1/infrastructure/ai/whitelist/emails',
    {
      cache: 'no-store',
      query: {
        page: params?.page,
        pageSize: params?.pageSize,
        q: params?.q,
      },
    }
  );
}

export async function createAIWhitelistEmail(
  payload: CreateAIWhitelistEmailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AIWhitelistEmailResponse>(
    '/api/v1/infrastructure/ai/whitelist/emails',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateAIWhitelistEmail(
  email: string,
  payload: UpdateAIWhitelistEmailPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/${encodePathSegment(email)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteAIWhitelistEmail(
  email: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/infrastructure/ai/whitelist/${encodePathSegment(email)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listAiAgents(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentsResponse>('/api/v1/infrastructure/ai-agents', {
    cache: 'no-store',
  });
}

export async function saveAiAgent(
  payload: SaveAiAgentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentResponse>('/api/v1/infrastructure/ai-agents', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

export async function createChatIntegration(
  payload: CreateChatIntegrationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CreateChatIntegrationResponse>(
    '/api/v1/infrastructure/ai-agents/chat-integrations',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function deployAiAgentChannel(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentDeployResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/deploy`,
    {
      body: JSON.stringify({ channelId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function pauseAiAgentChannel(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/pause`,
    {
      body: JSON.stringify({ channelId }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function testAiAgentChannel(
  agentId: string,
  channelId: string,
  prompt?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentTestResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(agentId)}/test`,
    {
      body: JSON.stringify({ channelId, prompt }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function rotateAiAgentChannelSecret(
  agentId: string,
  channelId: string,
  name: string,
  value?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RotateAiAgentChannelSecretResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(channelId)}/secrets`,
    {
      body: JSON.stringify({ name, value }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function getAiAgentZaloPersonalStatus(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentZaloPersonalStatusResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(channelId)}/zalo-personal`,
    {
      cache: 'no-store',
    }
  );
}

export async function runAiAgentZaloPersonalAction(
  agentId: string,
  channelId: string,
  action: AiAgentZaloPersonalAction,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentZaloPersonalActionResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(channelId)}/zalo-personal`,
    {
      body: JSON.stringify({ action }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function startAiAgentZaloPersonalQrLogin(
  agentId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentZaloPersonalQrLoginResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(channelId)}/zalo-personal/qr-login`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function getAiAgentZaloPersonalQrLoginStatus(
  agentId: string,
  channelId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentZaloPersonalQrLoginResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(
      channelId
    )}/zalo-personal/qr-login?sessionId=${encodeURIComponent(sessionId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function abortAiAgentZaloPersonalQrLogin(
  agentId: string,
  channelId: string,
  sessionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AiAgentZaloPersonalQrLoginResponse>(
    `/api/v1/infrastructure/ai-agents/${encodePathSegment(
      agentId
    )}/channels/${encodePathSegment(
      channelId
    )}/zalo-personal/qr-login?sessionId=${encodeURIComponent(sessionId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function saveAiAgentIdentityLink(
  payload: AiAgentIdentityLink,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SaveAiAgentIdentityResponse>(
    '/api/v1/infrastructure/ai-agents/identities',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function listAiAgentExternalThreads(
  params?: {
    agentId?: string | null;
    channelId?: string | null;
    wsId?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalThreadsResponse>(
    '/api/v1/infrastructure/ai-agents/external-threads',
    {
      cache: 'no-store',
      query: {
        agentId: params?.agentId ?? undefined,
        channelId: params?.channelId ?? undefined,
        wsId: params?.wsId ?? undefined,
      },
    }
  );
}

export async function listAiAgentExternalMessages(
  threadId: string,
  params?: { limit?: number },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalMessagesResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/messages`,
    {
      cache: 'no-store',
      query: {
        limit: params?.limit,
      },
    }
  );
}

export async function syncAiAgentExternalThread(
  threadId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalSyncResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/sync`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function draftAiAgentExternalResponse(
  threadId: string,
  prompt: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AiAgentExternalDraftResponse>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/draft`,
    {
      body: JSON.stringify({ prompt }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function sendAiAgentExternalResponse(
  threadId: string,
  content: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ message: ChatMessage }>(
    `/api/v1/infrastructure/ai-agents/external-threads/${encodePathSegment(
      threadId
    )}/send`,
    {
      body: JSON.stringify({ content }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export type * from './types';
