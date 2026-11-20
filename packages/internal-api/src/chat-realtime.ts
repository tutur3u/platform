import {
  type ChatRealtimeConnection,
  type ChatRealtimeConnectionOptions,
  type ChatRealtimeTicketResponse,
  createChatRealtimeConnection,
} from '@tuturuuu/realtime/chat/client';
import { chatBasePath } from './chat-internal';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type {
  ChatRealtimeClientFrame,
  ChatRealtimeConnection,
  ChatRealtimeConnectionStatus,
  ChatRealtimeServerFrame,
  ChatRealtimeTicketResponse,
} from '@tuturuuu/realtime/chat/client';

/**
 * Requests a WebSocket ticket for the workspace inbox, or for one
 * conversation room. `{ enabled: false }` means the Worker is not configured
 * and the caller should poll.
 */
export async function getWorkspaceChatRealtimeTicket(
  workspaceId: string,
  params?: { conversationId?: string | null },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ChatRealtimeTicketResponse>(
    `${chatBasePath(workspaceId)}/realtime/ticket`,
    {
      cache: 'no-store',
      query: params?.conversationId
        ? { conversationId: params.conversationId }
        : undefined,
    }
  );
}

export function createWorkspaceChatRealtimeConnection(
  workspaceId: string,
  params: { conversationId?: string | null } & Omit<
    ChatRealtimeConnectionOptions,
    'getTicket'
  >,
  options?: InternalApiClientOptions
): ChatRealtimeConnection {
  const { conversationId, ...handlers } = params;
  return createChatRealtimeConnection({
    ...handlers,
    getTicket: () =>
      getWorkspaceChatRealtimeTicket(workspaceId, { conversationId }, options),
  });
}
