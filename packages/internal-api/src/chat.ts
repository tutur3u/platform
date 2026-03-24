import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface WorkspaceChatChannel {
  id: string;
  ws_id: string;
  name: string;
  created_at: string | null;
  created_by: string | null;
  updated_at?: string | null;
  description?: string | null;
  is_private?: boolean | null;
}

export interface WorkspaceChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface WorkspaceChatParticipant {
  channel_id: string;
  user_id: string;
  last_read_at: string | null;
}

export async function listWorkspaceChatChannels(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ channels: WorkspaceChatChannel[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels`,
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      cache: 'no-store',
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/messages`,
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      cache: 'no-store',
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/participants`,
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/participants`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/typing`,
    {
      method: 'POST',
      cache: 'no-store',
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
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/chat/channels/${encodePathSegment(channelId)}/typing`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}
