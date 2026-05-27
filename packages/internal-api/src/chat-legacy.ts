import { chatBasePath } from './chat-internal';
import type {
  WorkspaceChatChannel,
  WorkspaceChatMessage,
  WorkspaceChatParticipant,
} from './chat-types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export async function listWorkspaceChatChannels(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ channels: WorkspaceChatChannel[] }>(
    `${chatBasePath(workspaceId)}/channels`,
    { cache: 'no-store' }
  );
  return payload.channels ?? [];
}

export async function createWorkspaceChatChannel(
  workspaceId: string,
  name: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ channel: WorkspaceChatChannel }>(
    `${chatBasePath(workspaceId)}/channels`,
    {
      body: JSON.stringify({ name }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function listWorkspaceChatMessages(
  workspaceId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ messages: WorkspaceChatMessage[] }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/messages`,
    { cache: 'no-store' }
  );
  return payload.messages ?? [];
}

export async function createWorkspaceChatMessage(
  workspaceId: string,
  channelId: string,
  content: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: WorkspaceChatMessage }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/messages`,
    {
      body: JSON.stringify({ content }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function listWorkspaceChatParticipants(
  workspaceId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    participants: WorkspaceChatParticipant[];
  }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/participants`,
    { cache: 'no-store' }
  );
  return payload.participants ?? [];
}

export async function upsertWorkspaceChatParticipant(
  workspaceId: string,
  channelId: string,
  payload: { last_read_at?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/participants`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function upsertWorkspaceChatTyping(
  workspaceId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/typing`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function deleteWorkspaceChatTyping(
  workspaceId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `${chatBasePath(workspaceId)}/channels/${encodePathSegment(
      channelId
    )}/typing`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
