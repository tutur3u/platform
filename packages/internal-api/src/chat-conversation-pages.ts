import { chatBasePath } from './chat-internal';
import type { ChatConversation, ChatConversationPage } from './chat-types';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface ChatConversationPagePayload {
  canModerate?: boolean;
  conversations?: ChatConversation[];
  nextOffset?: number | null;
}

/** Normalizes a conversations response into a page. */
export function readChatConversationPage(
  payload: ChatConversationPagePayload
): ChatConversationPage {
  return {
    canModerate: payload.canModerate === true,
    conversations: (payload.conversations ?? []).filter(
      (conversation): conversation is ChatConversation =>
        Boolean(conversation?.id && conversation.type)
    ),
    nextOffset:
      typeof payload.nextOffset === 'number' ? payload.nextOffset : null,
  };
}

/**
 * Conversations the viewer can list in [workspaceId] whose title, or
 * another member's display name or handle, contains [query] (case- and
 * accent-insensitive, at least two characters), newest first.
 */
export async function searchWorkspaceChatConversations(
  workspaceId: string,
  query: string,
  params?: {
    archived?: 'active' | 'all' | 'archived';
    limit?: number;
    offset?: number;
  },
  options?: InternalApiClientOptions
): Promise<ChatConversationPage> {
  const client = getInternalApiClient(options);
  const payload = await client.json<ChatConversationPagePayload>(
    `${chatBasePath(workspaceId)}/conversations`,
    {
      cache: 'no-store',
      query: {
        archived: params?.archived,
        limit: params?.limit,
        offset: params?.offset,
        q: query,
      },
    }
  );
  return readChatConversationPage(payload);
}
