import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type HiveVector3 = {
  x: number;
  y: number;
  z: number;
};

export type HiveBlock = {
  id: string;
  type: string;
  position: HiveVector3;
};

export type HiveObject = {
  id: string;
  type: string;
  position: HiveVector3;
  rotation?: number;
};

export type HiveWorldData = {
  blocks: HiveBlock[];
  objects: HiveObject[];
};

export type HiveServer = {
  createdAt: string;
  description: string | null;
  enabled: boolean;
  id: string;
  maxPlayers: number;
  name: string;
  slug: string;
};

export type HiveWorldEvent = {
  actorUserId: string | null;
  createdAt: string;
  eventType: string;
  id: string;
  payload: Record<string, unknown>;
  revision: number;
  serverId: string;
};

export type HiveNpc = {
  backstory: string;
  backstoryEnabled: boolean;
  customPromptEnabled: boolean;
  id: string;
  memoryEnabled: boolean;
  model: string;
  name: string;
  position: HiveVector3;
  role: string;
  serverId: string;
  settings: Record<string, unknown>;
  systemPrompt: string;
};

export type HiveNpcMemory = {
  content: string;
  enabled: boolean;
  id: string;
  importance: number;
  npcId: string;
};

export type HiveNpcRun = {
  createdAt: string;
  id: string;
  inputContext: Record<string, unknown>;
  npcId: string;
  outputDecision: Record<string, unknown>;
};

export type HiveMember = {
  createdAt: string;
  enabled: boolean;
  id: string;
  notes: string | null;
  userId: string;
};

export type HiveSnapshotResponse = {
  events: HiveWorldEvent[];
  npcs: HiveNpc[];
  revision: number;
  server: HiveServer;
  world: HiveWorldData;
};

export type HiveServersResponse = {
  isAdmin: boolean;
  servers: HiveServer[];
};

export type HiveRealtimeTokenResponse = {
  expiresAt: string;
  token: string;
  url: string;
};

export type HiveWorldEventPayload = {
  eventType: string;
  expectedRevision: number;
  payload: Record<string, unknown>;
  world: HiveWorldData;
};

export type HiveNpcPayload = {
  backstory?: string;
  backstoryEnabled?: boolean;
  customPromptEnabled?: boolean;
  memoryEnabled?: boolean;
  model?: string;
  name: string;
  position?: HiveVector3;
  role?: string;
  settings?: Record<string, unknown>;
  systemPrompt?: string;
};

export type HiveNpcRunPayload = {
  expectedRevision: number;
  promptMode: 'default' | 'enhanced' | 'custom';
  world: HiveWorldData;
};

export type HiveServerPayload = Pick<
  HiveServer,
  'description' | 'enabled' | 'maxPlayers' | 'name'
>;

export type HiveMemberPayload = {
  enabled?: boolean;
  notes?: string | null;
  userId: string;
};

export async function listHiveServers(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<HiveServersResponse>(
    '/api/v1/hive/servers',
    {
      cache: 'no-store',
    }
  );
}

export async function createHiveServer(
  payload: HiveServerPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ server: HiveServer }>(
    '/api/v1/hive/servers',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function updateHiveServer(
  serverId: string,
  payload: Partial<HiveServerPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ server: HiveServer }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'PATCH',
    }
  );
}

export async function deleteHiveServer(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function getHiveSnapshot(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveSnapshotResponse>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createHiveWorldEvent(
  serverId: string,
  payload: HiveWorldEventPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    event: HiveWorldEvent;
    revision: number;
  }>(`/api/v1/hive/servers/${encodeURIComponent(serverId)}/events`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    method: 'POST',
  });
}

export async function createHiveNpc(
  serverId: string,
  payload: HiveNpcPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ npc: HiveNpc }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/npcs`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function updateHiveNpc(
  serverId: string,
  npcId: string,
  payload: Partial<HiveNpcPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ npc: HiveNpc }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/npcs/${encodeURIComponent(npcId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'PATCH',
    }
  );
}

export async function deleteHiveNpc(
  serverId: string,
  npcId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/npcs/${encodeURIComponent(npcId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function getHiveRealtimeToken(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveRealtimeTokenResponse>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/realtime-token`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function runHiveNpcDecision(
  serverId: string,
  npcId: string,
  payload: HiveNpcRunPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    event: HiveWorldEvent | null;
    run: HiveNpcRun;
  }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/npcs/${encodeURIComponent(npcId)}/run`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function listHiveMembers(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<{ members: HiveMember[] }>(
    '/api/v1/hive/members',
    {
      cache: 'no-store',
    }
  );
}

export async function upsertHiveMember(
  payload: HiveMemberPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ member: HiveMember }>(
    '/api/v1/hive/members',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}
