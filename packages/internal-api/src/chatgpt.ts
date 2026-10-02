import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ChatGPTConnections {
  enabled: boolean;
  userId?: string;
  accounts: Array<{
    clientId: string;
    label: string;
    connected: boolean;
    available: boolean;
    models: Array<{ slug: string; display_name: string; visibility: string }>;
  }>;
}

export function getChatGPTConnections(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<ChatGPTConnections>(
    '/api/v1/users/chatgpt',
    { cache: 'no-store' }
  );
}

export function disconnectChatGPT(
  clientId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ remoteRevoked: boolean }>(
    '/api/v1/users/chatgpt',
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    }
  );
}

export function createChatGPTChat(
  payload: { id: string; model: string; message: string },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ id: string; title: string }>(
    '/api/ai/chatgpt/new',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}
