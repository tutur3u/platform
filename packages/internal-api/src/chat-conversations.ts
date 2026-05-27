import {
  type ChatUploadUrlResponse,
  chatBasePath,
  uploadFileWithSignedUrl,
} from './chat-internal';
import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
  CreateChatConversationPayload,
  SendChatMessagePayload,
} from './chat-types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function listWorkspaceChatConversations(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ conversations: ChatConversation[] }>(
    `${chatBasePath(workspaceId)}/conversations`,
    { cache: 'no-store' }
  );
  return payload.conversations ?? [];
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
  return client.json<{ message: ChatMessage }>(
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

export async function uploadWorkspaceChatAttachment(
  workspaceId: string,
  conversationId: string,
  file: File,
  options?: InternalApiClientOptions
) {
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

export async function getWorkspaceChatAttachmentSignedUrl(
  workspaceId: string,
  conversationId: string,
  attachmentId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ signedUrl: string }>(
    `${chatBasePath(workspaceId)}/conversations/${encodePathSegment(
      conversationId
    )}/attachments/${encodePathSegment(attachmentId)}`,
    { cache: 'no-store' }
  );
  return payload.signedUrl;
}
