import type { Json } from '@tuturuuu/types/db';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type HiveJsonObject = { [key: string]: Json | undefined };

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
  state?: HiveJsonObject;
};

export type HiveWorldData = {
  blocks: HiveBlock[];
  objects: HiveObject[];
};

export type HiveServerSettings = {
  autonomousNpcEnabled?: boolean;
  cronEnabled?: boolean;
  llmProvider?: 'disabled' | 'ollama' | 'mira';
  maxLlmSpendPerTick?: number;
  maxTickBudget?: number;
  ollamaEnabled?: boolean;
  ollamaKeepAlive?: string;
  ollamaModel?: 'gemma4';
  simulationCronEnabled?: boolean;
  tickIntervalSeconds?: number;
};

export type HiveServer = {
  createdAt: string;
  description: string | null;
  enabled: boolean;
  id: string;
  maxPlayers: number;
  name: string;
  ollamaState?: HiveJsonObject;
  settings?: HiveServerSettings;
  slug: string;
  totalCurrency?: number;
};

export type HiveWorldEvent = {
  actorUserId: string | null;
  createdAt: string;
  eventType: string;
  id: string;
  payload: HiveJsonObject;
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
  settings: HiveJsonObject;
  status?: string;
  systemPrompt: string;
};

export type HiveRealtimeAwareness = {
  activeTool?: string;
  avatarUrl?: string | null;
  camera?: HiveVector3;
  color: string;
  cursor?: HiveVector3 | null;
  displayName: string;
  focus?: string;
  lastSeenAt: string;
  role: 'admin' | 'member' | 'researcher';
  selection?: { id: string; kind: string } | null;
  userId: string;
  worldPosition?: HiveVector3 | null;
};

export type HiveEconomySnapshot = {
  inventories?: Array<{
    item_type: string;
    owner_id: string;
    owner_type: string;
    quantity: number;
  }>;
  totalCurrency: number;
  warehouses?: Array<{
    capacity: number;
    id: string;
    name: string;
    position: HiveJsonObject;
  }>;
};

export type HiveCropSnapshot = Array<{
  crop_type: string;
  growth_stage: number;
  health: number;
  id: string;
  max_growth_stage: number;
  needs_water: boolean;
  position: HiveJsonObject;
}>;

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
  inputContext: HiveJsonObject;
  npcId: string;
  outputDecision: HiveJsonObject;
};

export type HiveMember = {
  createdAt: string;
  enabled: boolean;
  id: string;
  notes: string | null;
  userId: string;
};

export type HiveSnapshotResponse = {
  crdt?: {
    state: string | null;
    stateVector: string | null;
  };
  crops?: HiveCropSnapshot;
  economy?: HiveEconomySnapshot;
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
  payload: HiveJsonObject;
  world: HiveWorldData;
};

export type HiveCrdtUpdatePayload = {
  update: string;
  world?: HiveWorldData;
};

export type HiveFarmingActionPayload =
  | {
      action: 'plant';
      cropType?: string;
      npcId?: string;
      position: HiveVector3;
    }
  | {
      action: 'water';
      cropId: string;
    }
  | {
      action: 'harvest';
      cropId: string;
      npcId?: string;
    };

export type HiveWarehouseActionPayload =
  | {
      action: 'create';
      capacity?: number;
      name: string;
      position: HiveVector3;
    }
  | {
      action: 'transfer';
      fromOwnerId: string;
      fromOwnerType: 'npc' | 'warehouse';
      itemType: string;
      quantity: number;
      toOwnerId: string;
      toOwnerType: 'npc' | 'warehouse';
    };

export type HiveTradeActionPayload =
  | {
      action: 'create';
      expiresAt?: string | null;
      fromNpcId: string;
      offeredCurrency?: number;
      offeredItems?: Json[];
      requestedCurrency?: number;
      requestedItems?: Json[];
      toNpcId?: string | null;
    }
  | {
      acceptingNpcId: string;
      action: 'accept';
      tradeId: string;
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
  settings?: HiveJsonObject;
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

export async function getHiveCrdtSnapshot(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    opSeq: number;
    state: string | null;
    stateVector: string | null;
    world: HiveWorldData;
  }>(`/api/v1/hive/servers/${encodeURIComponent(serverId)}/crdt`, {
    cache: 'no-store',
  });
}

export async function postHiveCrdtUpdate(
  serverId: string,
  payload: HiveCrdtUpdatePayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    opSeq: number;
    stateVector: string | null;
    world: HiveWorldData;
  }>(`/api/v1/hive/servers/${encodeURIComponent(serverId)}/crdt`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    method: 'POST',
  });
}

export async function updateHiveServerSettings(
  serverId: string,
  payload: HiveServerSettings,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ server: HiveServer }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/settings`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'PATCH',
    }
  );
}

export async function getHiveEconomy(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    economy: HiveEconomySnapshot & { ledger?: Json[] };
  }>(`/api/v1/hive/servers/${encodeURIComponent(serverId)}/economy`, {
    cache: 'no-store',
  });
}

export async function runHiveFarmingAction(
  serverId: string,
  payload: HiveFarmingActionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<Json>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/farming`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function runHiveWarehouseAction(
  serverId: string,
  payload: HiveWarehouseActionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<Json>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/warehouses`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function runHiveTradeAction(
  serverId: string,
  payload: HiveTradeActionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<Json>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/trades`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function runHiveSimulationTick(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    result: { actions: number; serverId: string; status: string };
  }>(`/api/v1/hive/servers/${encodeURIComponent(serverId)}/simulate`, {
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
