import type { MiraToolName } from '@tuturuuu/ai/tools/mira-tools';

export const AI_AGENT_REGISTRY_PREFIX = 'AI_AGENT_REGISTRY';
export const AI_AGENT_IDENTITY_PREFIX = 'AI_AGENT_IDENTITY';
export const AI_AGENT_REDIS_SECRET =
  'AI_AGENT_CHAT_SDK_STATE_REDIS_URL' as const;

export const AI_AGENT_ADAPTERS = ['discord', 'zalo'] as const;
export type AiAgentAdapter = (typeof AI_AGENT_ADAPTERS)[number];

export const AI_AGENT_ALLOWED_TOOLS = [
  'get_workspace_context',
  'list_workspace_members',
  'get_my_tasks',
  'list_boards',
  'list_task_lists',
  'list_task_labels',
  'list_projects',
  'create_task',
  'update_task',
  'complete_task',
  'add_task_assignee',
  'remove_task_assignee',
  'add_task_labels',
  'remove_task_labels',
  'add_task_to_project',
  'remove_task_from_project',
  'get_upcoming_events',
  'create_event',
  'update_event',
] as const satisfies readonly MiraToolName[];

export type AiAgentAllowedTool = (typeof AI_AGENT_ALLOWED_TOOLS)[number];

export type AiAgentChannelStatus = 'draft' | 'deployed' | 'error' | 'paused';
export type AiAgentZaloAccountMode = 'official' | 'personal';

export const AI_AGENT_ZALO_PERSONAL_ENABLED_SECRET =
  'AI_AGENT_ZALO_PERSONAL_ENABLED' as const;

export interface AiAgentSecretDescriptor {
  configured: boolean;
  lastFour: string | null;
  name: string;
}

export interface AiAgentChannelConfig {
  adapter: AiAgentAdapter;
  displayName: string;
  enabled: boolean;
  id: string;
  lastDeployedAt: string | null;
  lastError: string | null;
  lastEventAt: string | null;
  mentionRoleIds: string[];
  secrets: AiAgentSecretDescriptor[];
  status: AiAgentChannelStatus;
  webhookUrl: string | null;
  workspaceId: string;
  autoRespond?: boolean;
  discordGuildId?: string | null;
  externalChannelId?: string | null;
  historySyncEnabled?: boolean;
  zaloAccountMode?: AiAgentZaloAccountMode;
  zaloOfficialAccountId?: string | null;
  zaloPersonalOwnId?: string | null;
}

export interface AiAgentDefinition {
  channels: AiAgentChannelConfig[];
  createdAt: string | null;
  enabled: boolean;
  id: string;
  instructions: string;
  modelId: string;
  name: string;
  temperature: number | null;
  tools: AiAgentAllowedTool[];
  updatedAt: string | null;
}

export interface SaveAiAgentChannelInput {
  adapter: AiAgentAdapter;
  displayName?: string;
  enabled?: boolean;
  id: string;
  mentionRoleIds?: string[];
  secrets?: Record<string, string | null | undefined>;
  status?: AiAgentChannelStatus;
  workspaceId: string;
  autoRespond?: boolean;
  discordGuildId?: string | null;
  externalChannelId?: string | null;
  historySyncEnabled?: boolean;
  zaloAccountMode?: AiAgentZaloAccountMode;
  zaloOfficialAccountId?: string | null;
  zaloPersonalOwnId?: string | null;
}

export interface SaveAiAgentInput {
  channels?: SaveAiAgentChannelInput[];
  enabled?: boolean;
  id: string;
  instructions?: string;
  modelId?: string;
  name: string;
  temperature?: number | null;
  tools?: AiAgentAllowedTool[];
}

export interface AiAgentDeployResult {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  missing: string[];
  ok: boolean;
  webhookUrl: string;
}

export interface AiAgentDiagnosticCheck {
  detail?: string | null;
  id: string;
  label: string;
  ok: boolean;
}

export interface AiAgentTestResult {
  checks?: AiAgentDiagnosticCheck[];
  ok: boolean;
  response: string;
}

export interface AiAgentZaloPersonalStatus {
  channelId: string;
  connected: boolean;
  enabled: boolean;
  lastError: string | null;
  lastEventAt: string | null;
  mode: AiAgentZaloAccountMode;
  ownId: string | null;
  running: boolean;
  startedAt: string | null;
}

export interface AiAgentIdentityLink {
  externalUserId: string;
  platformUserId: string;
  provider: 'zalo';
  providerAccountId: string;
  workspaceId: string;
}
