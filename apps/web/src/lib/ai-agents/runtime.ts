import { google } from '@ai-sdk/google';
import {
  type Message as ChatMessage,
  type Thread as ChatThread,
  createChatSdkRuntime,
} from '@tuturuuu/ai/chat-sdk';
import {
  createMiraStreamTools,
  type MiraToolName,
} from '@tuturuuu/ai/tools/mira-tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { stepCountIs, ToolLoopAgent, type ToolSet } from 'ai';
import {
  getChannelSecretValues,
  getRootSecretValue,
  markAiAgentChannelEvent,
  resolveZaloIdentity,
} from './registry';
import { resolveAiAgentRedisUrl } from './runtime-config';
import {
  AI_AGENT_ALLOWED_TOOLS,
  AI_AGENT_REDIS_SECRET,
  type AiAgentAdapter,
  type AiAgentChannelConfig,
  type AiAgentDefinition,
} from './types';

type MappedPlatformUser =
  | {
      ok: true;
      permissions: NonNullable<Awaited<ReturnType<typeof getPermissions>>>;
      userId: string;
    }
  | {
      ok: false;
      reason: string;
    };

function bareGoogleModel(modelId: string) {
  return modelId.split('/').at(-1) || 'gemini-3.1-flash-lite';
}

function selectTools(tools: ToolSet, allowed: readonly MiraToolName[]) {
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) =>
      allowed.includes(name as MiraToolName)
    )
  ) as ToolSet;
}

function adapterConfig({
  channel,
  secrets,
}: {
  channel: AiAgentChannelConfig;
  secrets: Record<string, string>;
}) {
  if (channel.adapter === 'discord') {
    return {
      applicationId: secrets.applicationId,
      botToken: secrets.botToken,
      mentionRoleIds: channel.mentionRoleIds,
      publicKey: secrets.publicKey,
      userName: channel.displayName,
    };
  }

  return {
    botToken: secrets.botToken,
    userName: channel.displayName,
    webhookSecret: secrets.webhookSecret,
  };
}

async function resolveMappedDiscordUser({
  channel,
  externalUserId,
}: {
  channel: AiAgentChannelConfig;
  externalUserId: string;
}) {
  if (!channel.discordGuildId) {
    return null;
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('discord_guild_members')
    .select('platform_user_id')
    .eq('discord_guild_id', channel.discordGuildId)
    .eq('discord_user_id', externalUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.platform_user_id ?? null;
}

async function resolveMappedPlatformUser({
  channel,
  message,
}: {
  channel: AiAgentChannelConfig;
  message: ChatMessage;
}): Promise<MappedPlatformUser> {
  if (message.author.isMe || message.author.isBot === true) {
    return { ok: false, reason: 'Bot-originated messages are ignored.' };
  }

  const externalUserId = message.author.userId;
  const userId =
    channel.adapter === 'discord'
      ? await resolveMappedDiscordUser({ channel, externalUserId })
      : await resolveZaloIdentity({
          externalUserId,
          providerAccountId: channel.zaloOfficialAccountId || channel.id,
          workspaceId: channel.workspaceId,
        });

  if (!userId) {
    return {
      ok: false,
      reason:
        'This external account is not linked to a Tuturuuu workspace user yet.',
    };
  }

  const permissions = await getPermissions({
    user: { id: userId, email: null },
    wsId: channel.workspaceId,
  });

  if (!permissions) {
    return {
      ok: false,
      reason:
        'The linked Tuturuuu user is not a member of this workspace or has no usable permissions.',
    };
  }

  return { ok: true, permissions, userId };
}

async function createAgentTools({
  agent,
  channel,
  mappedUser,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  mappedUser: Extract<MappedPlatformUser, { ok: true }>;
}) {
  const sbAdmin = await createAdminClient();
  const tools = createMiraStreamTools(
    {
      supabase: sbAdmin,
      userId: mappedUser.userId,
      workspaceContext: {
        memberCount: 0,
        name: 'Workspace',
        personal: false,
        workspaceContextId: channel.workspaceId,
        wsId: channel.workspaceId,
      },
      wsId: channel.workspaceId,
    },
    (permission: PermissionId) =>
      mappedUser.permissions.withoutPermission(permission)
  );

  const configuredTools = agent.tools.length
    ? agent.tools
    : AI_AGENT_ALLOWED_TOOLS;
  return selectTools(tools, configuredTools);
}

async function respondWithAgent({
  agent,
  channel,
  message,
  thread,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  message: ChatMessage;
  thread: ChatThread;
}) {
  const mappedUser = await resolveMappedPlatformUser({ channel, message });

  if (!mappedUser.ok) {
    await thread.post(mappedUser.reason);
    return;
  }

  await thread.startTyping();

  const tools = await createAgentTools({ agent, channel, mappedUser });
  const toolAgent = new ToolLoopAgent({
    instructions: `${agent.instructions}

Channel: ${channel.displayName} (${channel.adapter})
Workspace ID: ${channel.workspaceId}
Mapped Tuturuuu user ID: ${mappedUser.userId}

Only use the configured task and calendar tools. If a tool returns a permission error, explain that the mapped Tuturuuu user needs the relevant workspace permission.`,
    model: google(bareGoogleModel(agent.modelId)),
    stopWhen: stepCountIs(8),
    temperature: agent.temperature ?? undefined,
    tools,
  });

  const result = await toolAgent.stream({
    prompt: message.text || '[No text content]',
  });

  await thread.post(result.fullStream);
}

export async function createAiAgentChatRuntime({
  agent,
  channel,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
}) {
  const secrets = await getChannelSecretValues({
    agentId: agent.id,
    channelId: channel.id,
  });
  const redisUrl = resolveAiAgentRedisUrl({
    rootSecret: await getRootSecretValue(AI_AGENT_REDIS_SECRET),
  });
  const state = redisUrl
    ? {
        config: {
          keyPrefix: `ai-agents:${channel.id}`,
          url: redisUrl,
        },
        id: 'redis' as const,
      }
    : DEV_MODE
      ? ('memory' as const)
      : null;

  if (!state) {
    throw new Error(`${AI_AGENT_REDIS_SECRET} is required outside dev mode.`);
  }

  const chat = await createChatSdkRuntime({
    adapters: {
      [channel.adapter]: adapterConfig({ channel, secrets }),
    },
    concurrency: 'queue',
    dedupeTtlMs: 600_000,
    logger: 'silent',
    state,
    userName: channel.displayName || agent.name,
  });

  const handler = async (thread: ChatThread, message: ChatMessage) => {
    try {
      await respondWithAgent({ agent, channel, message, thread });
      await markAiAgentChannelEvent({
        agentId: agent.id,
        channelId: channel.id,
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'AI agent execution failed.';
      await markAiAgentChannelEvent({
        agentId: agent.id,
        channelId: channel.id,
        error: messageText,
      });
      await thread.post('The Tuturuuu agent could not complete this request.');
    }
  };

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await handler(thread, message);
  });
  chat.onSubscribedMessage(handler);

  return chat;
}

export function assertWebhookAdapter(value: string): AiAgentAdapter {
  if (value === 'discord' || value === 'zalo') {
    return value;
  }

  throw new Error('Unknown AI agent adapter.');
}
