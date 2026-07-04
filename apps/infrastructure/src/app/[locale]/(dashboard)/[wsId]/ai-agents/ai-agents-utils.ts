import type {
  AiAgentDefinition,
  AiAgentIdentityLink,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure/ai';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export const QUERY_KEY = ['infrastructure', 'ai-agents'];
export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';
export const SECRET_CLEAR_VALUE = '__tuturuuu_clear_secret__';
export const TOOL_ALLOWLIST = [
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
];

export type AiAgentsData = {
  agents: AiAgentDefinition[];
  identities: AiAgentIdentityLink[];
};

export type OneTimeSecret = {
  channelId: string;
  name: string;
  value: string;
} | null;

export function createInternalAiAgentWorkspaceOption(
  label = 'Internal'
): InternalApiWorkspaceSummary {
  return {
    access_type: 'member',
    avatar_url: null,
    created_by_me: false,
    id: ROOT_WORKSPACE_ID,
    logo_url: null,
    name: label,
    personal: false,
  };
}

export function mergeInternalAiAgentWorkspaceOption(
  workspaces: InternalApiWorkspaceSummary[] | null | undefined,
  {
    includeInternal,
    label,
  }: {
    includeInternal?: boolean;
    label?: string;
  }
) {
  const workspaceList = workspaces ?? [];

  if (!includeInternal) {
    return workspaceList;
  }

  const internalWorkspace = createInternalAiAgentWorkspaceOption(label);
  const filteredWorkspaces = workspaceList.filter(
    (workspace) => workspace.id !== ROOT_WORKSPACE_ID
  );

  return [internalWorkspace, ...filteredWorkspaces];
}

export function getAiAgentWorkspaceSearchValue(
  workspace: InternalApiWorkspaceSummary
) {
  const handle = (workspace as { handle?: string | null }).handle;
  const aliases =
    workspace.id === ROOT_WORKSPACE_ID
      ? ['internal', 'root', ROOT_WORKSPACE_ID]
      : [];

  return [workspace.id, workspace.name, handle, ...aliases]
    .filter(Boolean)
    .join(' ');
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function channelSecret(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (value === SECRET_CLEAR_VALUE) {
    return null;
  }
  return value ? value : undefined;
}

export function buildAgentPayload(
  formData: FormData,
  agent?: AiAgentDefinition
) {
  const id =
    agent?.id ||
    String(formData.get('id') ?? '')
      .trim()
      .toLowerCase();
  const workspaceId = String(formData.get('workspaceId') ?? '').trim();
  const discordChannelId =
    agent?.channels.find((channel) => channel.adapter === 'discord')?.id ||
    `${id}-discord`;
  const zaloChannelId =
    agent?.channels.find((channel) => channel.adapter === 'zalo')?.id ||
    `${id}-zalo`;
  const zaloAccountMode =
    String(formData.get('zaloAccountMode') ?? '').trim() === 'personal'
      ? 'personal'
      : 'official';

  return {
    channels: [
      {
        adapter: 'discord' as const,
        autoRespond: formData.get('discordAutoRespond') === 'on',
        displayName:
          String(formData.get('discordDisplayName') ?? '').trim() || 'Discord',
        enabled: formData.get('discordEnabled') === 'on',
        externalChannelId:
          String(formData.get('discordExternalChannelId') ?? '').trim() || null,
        historySyncEnabled: formData.get('discordHistorySyncEnabled') === 'on',
        id: discordChannelId,
        mentionRoleIds: splitLines(formData.get('discordMentionRoleIds')),
        secrets: {
          applicationId: channelSecret(formData, 'discordApplicationId'),
          botToken: channelSecret(formData, 'discordBotToken'),
          publicKey: channelSecret(formData, 'discordPublicKey'),
        },
        workspaceId,
        discordGuildId:
          String(formData.get('discordGuildId') ?? '').trim() || null,
      },
      {
        adapter: 'zalo' as const,
        autoRespond: formData.get('zaloAutoRespond') === 'on',
        displayName:
          String(formData.get('zaloDisplayName') ?? '').trim() || 'Zalo',
        enabled: formData.get('zaloEnabled') === 'on',
        externalChannelId:
          String(formData.get('zaloExternalChannelId') ?? '').trim() || null,
        historySyncEnabled: formData.get('zaloHistorySyncEnabled') === 'on',
        id: zaloChannelId,
        secrets: {
          botToken: channelSecret(formData, 'zaloBotToken'),
          personalCookieJson: channelSecret(formData, 'zaloPersonalCookieJson'),
          personalImei: channelSecret(formData, 'zaloPersonalImei'),
          personalUserAgent: channelSecret(formData, 'zaloPersonalUserAgent'),
          webhookSecret: channelSecret(formData, 'zaloWebhookSecret'),
        },
        workspaceId,
        zaloAccountMode,
        zaloOfficialAccountId:
          String(formData.get('zaloOfficialAccountId') ?? '').trim() || null,
        zaloPersonalOwnId:
          String(formData.get('zaloPersonalOwnId') ?? '').trim() || null,
      },
    ],
    enabled: formData.get('enabled') === 'on',
    id,
    instructions: String(formData.get('instructions') ?? '').trim(),
    modelId: String(formData.get('modelId') ?? '').trim() || DEFAULT_MODEL,
    name: String(formData.get('name') ?? '').trim(),
    tools: TOOL_ALLOWLIST,
  } satisfies SaveAiAgentPayload;
}
