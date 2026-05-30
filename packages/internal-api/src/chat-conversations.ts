import { uploadAiChatFile } from './ai';
import {
  type ChatUploadUrlResponse,
  chatBasePath,
  uploadFileWithSignedUrl,
} from './chat-internal';
import type {
  ChatAiObservability,
  ChatAiSettings,
  ChatConversation,
  ChatConversationPage,
  ChatFriendRequest,
  ChatFriendRequests,
  ChatLinkPreview,
  ChatMessage,
  ChatMessageStreamEvent,
  ChatSharedContent,
  ChatUserProfile,
  CreateChatConversationPayload,
  DeleteChatConversationResult,
  SendChatMessagePayload,
  SendChatMessageResult,
  SendChatMessageStreamHandlers,
  UpdateChatAiSettingsPayload,
  UpdateChatConversationPayload,
} from './chat-types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

const AI_CHAT_CONVERSATION_PREFIXES = ['ai-chat-', 'legacy-ai-'] as const;
const AI_CHAT_FILE_ATTACHMENT_PREFIX = 'ai-file:';

export async function listWorkspaceChatConversations(
  workspaceId: string,
  params?: {
    archived?: 'active' | 'all' | 'archived';
    limit?: number;
    offset?: number;
  },
  options?: InternalApiClientOptions
) {
  const page = await listWorkspaceChatConversationsPage(
    workspaceId,
    params,
    options
  );
  return page.conversations;
}

export async function listWorkspaceChatConversationsPage(
  workspaceId: string,
  params?: {
    archived?: 'active' | 'all' | 'archived';
    limit?: number;
    offset?: number;
  },
  options?: InternalApiClientOptions
): Promise<ChatConversationPage> {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    conversations: ChatConversation[];
    nextOffset?: number | null;
  }>(`${chatBasePath(workspaceId)}/conversations`, {
    cache: 'no-store',
    query: {
      archived: params?.archived,
      limit: params?.limit,
      offset: params?.offset,
    },
  });
  const conversations = (payload.conversations ?? []).filter(
    (conversation): conversation is ChatConversation =>
      Boolean(conversation?.id && conversation.type)
  );

  return {
    conversations,
    nextOffset:
      typeof payload.nextOffset === 'number' ? payload.nextOffset : null,
  };
}

export async function createWorkspaceChatConversation(
  workspaceId: string,
  payload: CreateChatConversationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ conversation: ChatConversation }>(
    `${chatBasePath(workspaceId)}/conversations`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function deleteWorkspaceChatConversation(
  workspaceId: string,
  conversationId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ result: DeleteChatConversationResult }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function updateWorkspaceChatConversation(
  workspaceId: string,
  conversationId: string,
  payload: UpdateChatConversationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ conversation: ChatConversation }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function listWorkspaceChatConversationMessages(
  workspaceId: string,
  conversationId: string,
  options?: { before?: string; limit?: number },
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  const payload = await client.json<{ messages: ChatMessage[] }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/messages`,
    {
      cache: 'no-store',
      query: {
        before: options?.before,
        limit: options?.limit,
      },
    }
  );
  return payload.messages ?? [];
}

export async function sendWorkspaceChatMessage(
  workspaceId: string,
  conversationId: string,
  payload: SendChatMessagePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SendChatMessageResult>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/messages`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function sendWorkspaceChatMessageStream(
  workspaceId: string,
  conversationId: string,
  payload: SendChatMessagePayload,
  handlers: SendChatMessageStreamHandlers = {},
  options?: InternalApiClientOptions
): Promise<SendChatMessageResult> {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/messages`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error(await readInternalApiErrorMessage(response));
  }

  if (!response.body) {
    return response.json() as Promise<SendChatMessageResult>;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-ndjson')) {
    return response.json() as Promise<SendChatMessageResult>;
  }

  const messages: ChatMessage[] = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let assistantError: string | undefined;
  const processEvent = (event: ChatMessageStreamEvent | null) => {
    if (!event) return;

    if (event.type === 'error') {
      if (messages.length > 0) {
        assistantError = event.message || 'Assistant response failed';
        return;
      }

      throw new Error(event.message);
    }

    if (event.type === 'message') {
      messages.push(event.message);
      handlers.onMessage?.(event.message);
    } else if (event.type === 'assistant_delta') {
      handlers.onAssistantDelta?.(event.delta);
    } else if (event.type === 'assistant_part') {
      handlers.onAssistantPart?.(event.part);
    } else if (event.type === 'messages') {
      messages.push(...event.messages);
      handlers.onMessages?.(event.messages);
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        processEvent(parseChatMessageStreamEvent(line));
      }
    }

    if (done) break;
  }

  processEvent(parseChatMessageStreamEvent(buffer));

  const message = messages.at(-1);
  if (!message) {
    throw new Error('No message was returned');
  }

  return assistantError
    ? { assistantError, message, messages }
    : { message, messages };
}

export async function editWorkspaceChatMessage(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  payload: { content: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: ChatMessage }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/messages/${encodePathSegment(messageId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteWorkspaceChatMessage(
  workspaceId: string,
  conversationId: string,
  messageId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: ChatMessage }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/messages/${encodePathSegment(messageId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function markWorkspaceChatConversationRead(
  workspaceId: string,
  conversationId: string,
  payload?: { messageId?: string | null },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ conversation: ChatConversation }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/read`,
    {
      body: JSON.stringify(payload ?? {}),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function toggleWorkspaceChatReaction(
  workspaceId: string,
  conversationId: string,
  payload: { emoji: string; messageId: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: ChatMessage }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/reactions`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function getWorkspaceChatLinkPreviews(
  workspaceId: string,
  conversationId: string,
  urls: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ previews: ChatLinkPreview[] }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/link-previews`,
    {
      body: JSON.stringify({ urls }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
  return payload.previews ?? [];
}

export async function getWorkspaceChatSharedContent(
  workspaceId: string,
  conversationId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ sharedContent: ChatSharedContent }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/shared-content`,
    { cache: 'no-store' }
  );
  return {
    files: payload.sharedContent?.files ?? [],
    links: payload.sharedContent?.links ?? [],
    photos: payload.sharedContent?.photos ?? [],
  };
}

export async function getWorkspaceChatAiSettings(
  workspaceId: string,
  conversationId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ settings: ChatAiSettings }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/ai-settings`,
    { cache: 'no-store' }
  );
  return payload.settings;
}

export async function updateWorkspaceChatAiSettings(
  workspaceId: string,
  conversationId: string,
  payload: UpdateChatAiSettingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ settings: ChatAiSettings }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/ai-settings`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function getWorkspaceChatAiObservability(
  workspaceId: string,
  conversationId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ observability: ChatAiObservability }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/ai-observability`,
    { cache: 'no-store' }
  );
  return payload.observability;
}

export async function searchWorkspaceChatDirectory(
  workspaceId: string,
  query: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ users: ChatUserProfile[] }>(
    `${chatBasePath(workspaceId)}/directory`,
    {
      cache: 'no-store',
      query: { q: query },
    }
  );
  return payload.users ?? [];
}

export async function searchWorkspaceChatMessages(
  workspaceId: string,
  query: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ messages: ChatMessage[] }>(
    `${chatBasePath(workspaceId)}/search`,
    {
      cache: 'no-store',
      query: { q: query },
    }
  );
  return payload.messages ?? [];
}

async function readInternalApiErrorMessage(response: Response) {
  const fallbackMessage = `Internal API request failed: ${response.status}`;
  const text = await response.text().catch(() => '');

  try {
    const data = JSON.parse(text) as {
      error?: string;
      message?: string;
    };
    return data.message || data.error || fallbackMessage;
  } catch {
    return text || fallbackMessage;
  }
}

function parseChatMessageStreamEvent(
  line: string
): ChatMessageStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const event = JSON.parse(trimmed) as ChatMessageStreamEvent;
    return typeof event?.type === 'string' ? event : null;
  } catch {
    return null;
  }
}

export async function listWorkspaceChatFriendRequests(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<ChatFriendRequests>(
    `${chatBasePath(workspaceId)}/friend-requests`,
    { cache: 'no-store' }
  );

  return {
    accepted: payload.accepted ?? [],
    incoming: payload.incoming ?? [],
    outgoing: payload.outgoing ?? [],
  };
}

export async function createWorkspaceChatFriendRequest(
  workspaceId: string,
  payload: { email: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ request: ChatFriendRequest }>(
    `${chatBasePath(workspaceId)}/friend-requests`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function respondWorkspaceChatFriendRequest(
  workspaceId: string,
  requestId: string,
  payload: { status: 'accepted' | 'declined' },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ request: ChatFriendRequest }>(
    `${chatBasePath(workspaceId)}/friend-requests/${encodePathSegment(
      requestId
    )}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function revokeWorkspaceChatFriendRequest(
  workspaceId: string,
  requestId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ request: ChatFriendRequest }>(
    `${chatBasePath(workspaceId)}/friend-requests/${encodePathSegment(
      requestId
    )}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function uploadWorkspaceChatAttachment(
  workspaceId: string,
  conversationId: string,
  file: File,
  options?: InternalApiClientOptions
) {
  const aiChatId = getAiChatResourceIdFromConversationId(conversationId);
  if (aiChatId) {
    return uploadAiChatFile(
      {
        chatId: aiChatId,
        file,
        workspaceId,
      },
      options
    );
  }

  const client = getInternalApiClient(options);
  const fetchImpl = options?.fetch ?? globalThis.fetch;
  const uploadPayload = await client.json<ChatUploadUrlResponse>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/attachments/upload-url`,
    {
      body: JSON.stringify({
        contentType: file.type || 'application/octet-stream',
        filename: file.name,
        sizeBytes: file.size,
      }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );

  await uploadFileWithSignedUrl(file, uploadPayload, fetchImpl);

  return uploadPayload.attachment;
}

function getAiChatResourceIdFromConversationId(conversationId: string) {
  for (const prefix of AI_CHAT_CONVERSATION_PREFIXES) {
    if (conversationId.startsWith(prefix)) {
      return conversationId.slice(prefix.length);
    }
  }

  return null;
}

export async function getWorkspaceChatAttachmentSignedUrl(
  workspaceId: string,
  conversationId: string,
  attachmentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const aiChatFilePath = decodeAiChatFileAttachmentPath(attachmentId);

  if (getAiChatResourceIdFromConversationId(conversationId) && aiChatFilePath) {
    const payload = await client.json<{
      urls: { path: string; signedUrl: string | null }[];
    }>('/api/ai/chat/signed-read-url', {
      body: JSON.stringify({ paths: [aiChatFilePath] }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const signedUrl = payload.urls?.[0]?.signedUrl;

    if (!signedUrl) {
      throw new Error('Attachment URL is unavailable');
    }

    return signedUrl;
  }

  const payload = await client.json<{ signedUrl: string }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/attachments/${encodePathSegment(attachmentId)}`,
    { cache: 'no-store' }
  );
  return payload.signedUrl;
}

function decodeAiChatFileAttachmentPath(attachmentId: string) {
  if (!attachmentId.startsWith(AI_CHAT_FILE_ATTACHMENT_PREFIX)) return null;

  try {
    return decodeURIComponent(
      attachmentId.slice(AI_CHAT_FILE_ATTACHMENT_PREFIX.length)
    );
  } catch {
    return null;
  }
}
