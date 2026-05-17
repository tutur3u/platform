import type { AIModelUI, InternalApiWorkspaceSummary } from '@tuturuuu/types';
import type { Json } from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

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
  state?: HiveJsonObject;
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
  defaultCreditSource?: HiveCreditSource;
  defaultCreditWsId?: string | null;
  defaultModel?: string | null;
  llmProvider?: 'disabled' | 'ollama' | 'mira';
  maxAutonomousInteractionsPerTick?: number;
  maxInteractionTurns?: number;
  maxLlmSpendPerTick?: number;
  maxTickBudget?: number;
  minInteractionCooldownSeconds?: number;
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
  actorUserId?: string | null;
  autonomous?: boolean;
  creditSource?: HiveCreditSource | null;
  creditWsId?: string | null;
  creditsDeducted?: number;
  createdAt: string;
  error?: string | null;
  id: string;
  inputContext: HiveJsonObject;
  inputTokens?: number;
  interactionId?: string | null;
  llmCost?: number;
  llmModel?: string | null;
  llmProvider?: string | null;
  npcId: string;
  outputDecision: HiveJsonObject;
  outputTokens?: number;
  promptMode?: string;
  reasoningTokens?: number;
  status?: HiveNpcRunStatus;
  targetNpcId?: string | null;
  trigger?: HiveNpcRunTrigger;
};

export type HiveCreditSource = 'personal' | 'workspace';

export type HiveNpcRunStatus = 'completed' | 'failed' | 'running' | 'skipped';

export type HiveNpcRunTrigger =
  | 'autonomous'
  | 'cron'
  | 'manual'
  | 'simulation'
  | 'workflow';

export type HiveAiCreditStatus = {
  allowedFeatures: string[];
  allowedModels: string[];
  balanceScope: 'user' | 'workspace';
  bonusCredits: number;
  dailyLimit: number | null;
  dailyUsed: number;
  defaultImageModel: string;
  defaultLanguageModel: string;
  maxOutputTokens: number | null;
  payg?: {
    nextExpiry: string | null;
    remaining: number;
    totalGranted: number;
    totalUsed: number;
  };
  percentUsed: number;
  periodEnd: string;
  periodStart: string;
  remaining: number;
  seatCount: number | null;
  tier: string;
  totalAllocated: number;
  totalUsed: number;
};

export type HiveMember = {
  createdAt: string;
  enabled: boolean;
  id: string;
  notes: string | null;
  userId: string;
};

export type HiveAccessRequestStatus =
  | 'approved'
  | 'none'
  | 'pending'
  | 'rejected';

export type HiveAccessRequest = {
  createdAt: string;
  email: string | null;
  id: string;
  note: string | null;
  requestedAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  status: Exclude<HiveAccessRequestStatus, 'none'>;
  updatedAt: string;
  userId: string;
};

export type HiveAccessRequestStatusResponse = {
  hasAccess: boolean;
  member: HiveMember | null;
  request: HiveAccessRequest | null;
  status: HiveAccessRequestStatus;
};

export type HiveAccessRequestPayload = {
  note?: string | null;
};

export type HiveAccessRequestApprovalPayload = {
  notes?: string | null;
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

export type HiveWorkspacesResponse = {
  personalWorkspaceId: string | null;
  workspaces: InternalApiWorkspaceSummary[];
};

export type HiveAiModelsResponse = {
  models: AIModelUI[];
};

export type HiveTimelineEventItem = {
  actorUserId: string | null;
  createdAt: string;
  eventType: string;
  id: string;
  kind: 'event';
  payload: HiveJsonObject;
  revision: number;
};

export type HiveTimelineRunItem = {
  actorUserId: string | null;
  autonomous: boolean;
  creditSource: HiveCreditSource | null;
  creditWsId: string | null;
  creditsDeducted: number;
  createdAt: string;
  error: string | null;
  id: string;
  inputContext: HiveJsonObject;
  inputTokens: number;
  interactionId: string | null;
  kind: 'run';
  llmCost: number;
  llmModel: string | null;
  llmProvider: string | null;
  npcId: string;
  npcName: string | null;
  outputDecision: HiveJsonObject;
  outputTokens: number;
  promptMode: string;
  reasoningTokens: number;
  status: HiveNpcRunStatus;
  targetNpcId: string | null;
  targetNpcName: string | null;
  trigger: HiveNpcRunTrigger;
};

export type HiveTimelineInteractionItem = {
  actorUserId: string | null;
  autonomous: boolean;
  createdAt: string;
  creditSource: HiveCreditSource | null;
  creditWsId: string | null;
  creditsDeducted: number;
  id: string;
  interactionId: string;
  kind: 'interaction';
  llmCost: number;
  llmModel: string | null;
  llmProvider: string | null;
  npcName: string | null;
  runs: HiveTimelineRunItem[];
  status: HiveNpcRunStatus;
  targetNpcName: string | null;
  trigger: HiveNpcRunTrigger;
};

export type HiveTimelineItem =
  | HiveTimelineEventItem
  | HiveTimelineInteractionItem
  | HiveTimelineRunItem;

export type HiveTimelineResponse = {
  items: HiveTimelineItem[];
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

export type HiveWorkflowNodeType =
  | 'condition'
  | 'context'
  | 'farming'
  | 'log'
  | 'manual_trigger'
  | 'npc_decision'
  | 'simulation_tick'
  | 'trade'
  | 'transform'
  | 'update_npc'
  | 'warehouse'
  | 'world_event';

export type HiveWorkflowNodePosition = {
  x: number;
  y: number;
};

export type HiveWorkflowNode = {
  data: {
    config?: HiveJsonObject;
    description?: string;
    label: string;
  };
  id: string;
  position: HiveWorkflowNodePosition;
  type: HiveWorkflowNodeType;
};

export type HiveWorkflowEdge = {
  id: string;
  label?: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
};

export type HiveWorkflowDefinition = {
  edges: HiveWorkflowEdge[];
  nodes: HiveWorkflowNode[];
  version: 1;
};

export type HiveWorkflow = {
  archivedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  definition: HiveWorkflowDefinition;
  description: string | null;
  enabled: boolean;
  id: string;
  name: string;
  serverId: string;
  updatedAt: string;
  updatedBy: string | null;
  version: number;
};

export type HiveWorkflowRunStatus = 'completed' | 'failed' | 'running';

export type HiveWorkflowStepTrace = {
  durationMs?: number;
  error?: string | null;
  input?: Json;
  nodeId: string;
  nodeType: HiveWorkflowNodeType;
  output?: Json;
  status: HiveWorkflowRunStatus;
};

export type HiveWorkflowRun = {
  actorUserId: string | null;
  createdAt: string;
  error: string | null;
  finishedAt: string | null;
  id: string;
  input: Json;
  output: Json;
  serverId: string;
  startedAt: string;
  status: HiveWorkflowRunStatus;
  stepTrace: HiveWorkflowStepTrace[];
  workflowId: string;
};

export type HiveWorkflowPayload = {
  definition: HiveWorkflowDefinition;
  description?: string | null;
  enabled?: boolean;
  name: string;
};

export type HiveWorkflowRunPayload = {
  input?: HiveJsonObject;
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
  creditSource?: HiveCreditSource;
  creditWsId?: string;
  expectedRevision: number;
  maxTurns?: number;
  model?: string;
  promptMode: 'default' | 'enhanced' | 'custom';
  prompt?: string | null;
  targetNpcId?: string | null;
  trigger?: HiveNpcRunTrigger;
  world: HiveWorldData;
};

export type HiveNpcInteractionPayload = {
  creditSource?: HiveCreditSource;
  creditWsId?: string;
  expectedRevision: number;
  maxTurns?: number;
  model?: string;
  prompt?: string | null;
  sourceNpcId: string;
  targetNpcId: string;
  trigger?: HiveNpcRunTrigger;
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

export async function getMyHiveAccessRequestStatus(
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveAccessRequestStatusResponse>(
    '/api/v1/hive/access-requests/me',
    {
      cache: 'no-store',
    }
  );
}

export async function requestHiveAccess(
  payload: HiveAccessRequestPayload = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveAccessRequestStatusResponse>(
    '/api/v1/hive/access-requests/me',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function listHiveAccessRequests(
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    requests: HiveAccessRequest[];
  }>('/api/v1/hive/access-requests', {
    cache: 'no-store',
  });
}

export async function approveHiveAccessRequest(
  requestId: string,
  payload: HiveAccessRequestApprovalPayload = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    member: HiveMember;
    request: HiveAccessRequest;
  }>(`/api/v1/hive/access-requests/${encodeURIComponent(requestId)}/approve`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    method: 'POST',
  });
}

export async function listHiveServers(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<HiveServersResponse>(
    '/api/v1/hive/servers',
    {
      cache: 'no-store',
    }
  );
}

export async function listHiveWorkspaces(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<HiveWorkspacesResponse>(
    '/api/v1/hive/workspaces',
    {
      cache: 'no-store',
    }
  );
}

export async function getHiveAiCredits(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveAiCreditStatus>(
    '/api/v1/hive/ai/credits',
    {
      cache: 'no-store',
      query: { wsId: workspaceId },
    }
  );
}

export async function listHiveAiModels(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<HiveAiModelsResponse>(
    '/api/v1/hive/ai/models',
    {
      cache: 'no-store',
      query: { enabled: true, type: 'language' },
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

export async function listHiveTimeline(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<HiveTimelineResponse>(
    `/api/v1/hive/servers/${encodePathSegment(serverId)}/timeline`,
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

export async function runHiveNpcInteraction(
  serverId: string,
  payload: HiveNpcInteractionPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{
    event: HiveWorldEvent;
    interactionId: string;
    runs: HiveNpcRun[];
  }>(`/api/v1/hive/servers/${encodePathSegment(serverId)}/interactions`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    method: 'POST',
  });
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
    interactionId?: string;
    run: HiveNpcRun;
    runs?: HiveNpcRun[];
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

export async function listHiveWorkflows(
  serverId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ workflows: HiveWorkflow[] }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows`,
    {
      cache: 'no-store',
    }
  );
}

export async function createHiveWorkflow(
  serverId: string,
  payload: HiveWorkflowPayload,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ workflow: HiveWorkflow }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function updateHiveWorkflow(
  serverId: string,
  workflowId: string,
  payload: Partial<HiveWorkflowPayload>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ workflow: HiveWorkflow }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows/${encodeURIComponent(workflowId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'PATCH',
    }
  );
}

export async function archiveHiveWorkflow(
  serverId: string,
  workflowId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ ok: true }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows/${encodeURIComponent(workflowId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function runHiveWorkflow(
  serverId: string,
  workflowId: string,
  payload: HiveWorkflowRunPayload = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ run: HiveWorkflowRun }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows/${encodeURIComponent(workflowId)}/run`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function listHiveWorkflowRuns(
  serverId: string,
  workflowId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ runs: HiveWorkflowRun[] }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows/${encodeURIComponent(workflowId)}/runs`,
    {
      cache: 'no-store',
    }
  );
}

export async function getHiveWorkflowRun(
  serverId: string,
  workflowId: string,
  runId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ run: HiveWorkflowRun }>(
    `/api/v1/hive/servers/${encodeURIComponent(serverId)}/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`,
    {
      cache: 'no-store',
    }
  );
}
