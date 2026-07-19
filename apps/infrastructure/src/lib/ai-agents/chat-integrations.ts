import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { toVirtualAiAgentConversationId } from '@/lib/chat/agent-discovery';
import { getAiAgentById, saveAiAgent } from './registry';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentChannelInput,
} from './types';

export type ChatIntegrationKind = 'discord' | 'zalo-official' | 'zalo-personal';

const CHAT_INTEGRATIONS_AGENT_ID = 'chat-integrations';
const CHAT_INTEGRATIONS_AGENT_NAME = 'Chat Integrations';

const CHAT_INTEGRATION_CHANNELS = {
  discord: {
    adapter: 'discord',
    displayName: 'Discord',
    id: 'chat-discord',
  },
  'zalo-official': {
    adapter: 'zalo',
    displayName: 'Zalo Official',
    id: 'chat-zalo-official',
    zaloAccountMode: 'official',
  },
  'zalo-personal': {
    adapter: 'zalo',
    displayName: 'Zalo Personal',
    id: 'chat-zalo-personal',
    zaloAccountMode: 'personal',
  },
} as const satisfies Record<
  ChatIntegrationKind,
  Pick<
    SaveAiAgentChannelInput,
    'adapter' | 'displayName' | 'id' | 'zaloAccountMode'
  >
>;

export async function createChatIntegrationChannel({
  actorUserId,
  db,
  displayName,
  kind,
  origin,
}: {
  actorUserId: string;
  db?: TypedSupabaseClient;
  displayName?: string | null;
  kind: ChatIntegrationKind;
  origin?: string | null;
}) {
  const channelDefaults = CHAT_INTEGRATION_CHANNELS[kind];
  const existing = await getAiAgentById({
    agentId: CHAT_INTEGRATIONS_AGENT_ID,
    db,
    origin,
  });
  const existingChannel = existing?.channels.find(
    (channel) => channel.id === channelDefaults.id
  );
  const existingChannels = existing?.channels.filter(
    (channel) => channel.id !== channelDefaults.id
  );
  const channel = buildManagedChannelInput({
    channel: existingChannel,
    defaults: channelDefaults,
    displayName,
  });
  const saved = await saveAiAgent({
    actorUserId,
    db,
    origin,
    payload: {
      channels: [
        ...(existingChannels ?? []).map(buildExistingChannelInput),
        channel,
      ],
      enabled: true,
      id: CHAT_INTEGRATIONS_AGENT_ID,
      instructions: existing?.instructions,
      modelId: existing?.modelId,
      name: existing?.name ?? CHAT_INTEGRATIONS_AGENT_NAME,
      temperature: existing?.temperature,
      tools: existing?.tools,
    },
  });
  const savedChannel = saved.channels.find(
    (candidate) => candidate.id === channel.id
  );

  if (!savedChannel) {
    throw new Error('chat_integration_channel_missing');
  }

  return {
    agent: saved,
    channel: savedChannel,
    conversationId: toVirtualAiAgentConversationId(saved.id, savedChannel.id),
  };
}

function buildManagedChannelInput({
  channel,
  defaults,
  displayName,
}: {
  channel?: AiAgentChannelConfig;
  defaults: (typeof CHAT_INTEGRATION_CHANNELS)[ChatIntegrationKind];
  displayName?: string | null;
}): SaveAiAgentChannelInput {
  return {
    adapter: defaults.adapter,
    autoRespond: channel?.autoRespond ?? false,
    displayName:
      displayName?.trim() || channel?.displayName || defaults.displayName,
    enabled: channel?.enabled ?? true,
    externalChannelId: channel?.externalChannelId ?? null,
    historySyncEnabled: channel?.historySyncEnabled ?? true,
    id: defaults.id,
    mentionRoleIds: channel?.mentionRoleIds ?? [],
    status: channel?.status ?? 'draft',
    workspaceId: channel?.workspaceId ?? ROOT_WORKSPACE_ID,
    ...(defaults.adapter === 'discord'
      ? {
          discordGuildId: channel?.discordGuildId ?? null,
        }
      : {
          zaloAccountMode: defaults.zaloAccountMode,
          zaloOfficialAccountId:
            defaults.zaloAccountMode === 'official'
              ? (channel?.zaloOfficialAccountId ?? null)
              : null,
          zaloPersonalOwnId:
            defaults.zaloAccountMode === 'personal'
              ? (channel?.zaloPersonalOwnId ?? null)
              : null,
        }),
  };
}

function buildExistingChannelInput(
  channel: AiAgentDefinition['channels'][number]
): SaveAiAgentChannelInput {
  return {
    adapter: channel.adapter,
    autoRespond: channel.autoRespond ?? true,
    displayName: channel.displayName,
    enabled: channel.enabled,
    externalChannelId: channel.externalChannelId ?? null,
    historySyncEnabled: channel.historySyncEnabled ?? true,
    id: channel.id,
    mentionRoleIds: channel.mentionRoleIds,
    status: channel.status,
    workspaceId: channel.workspaceId,
    ...(channel.adapter === 'discord'
      ? {
          discordGuildId: channel.discordGuildId ?? null,
        }
      : {
          zaloAccountMode: channel.zaloAccountMode ?? 'official',
          zaloOfficialAccountId: channel.zaloOfficialAccountId ?? null,
          zaloPersonalOwnId: channel.zaloPersonalOwnId ?? null,
        }),
  };
}
