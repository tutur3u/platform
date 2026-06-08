import { google } from '@ai-sdk/google';
import {
  type Thread as ChatThread,
  createChatSdkRuntime,
  type Message as SdkMessage,
  type SentMessage as SdkSentMessage,
} from '@tuturuuu/ai/chat-sdk';
import {
  createZaloPersonalAdapter,
  type ZaloPersonalAdapter,
} from '@tuturuuu/ai/chat-sdk/zalo-personal';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '@tuturuuu/ai/credits/resolve-plan-model';
import { withAiMemory } from '@tuturuuu/ai/memory';
import {
  createMiraStreamTools,
  type MiraToolName,
} from '@tuturuuu/ai/tools/mira-tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import {
  type LanguageModelUsage,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
} from 'ai';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import { persistAiAgentExternalSdkMessage } from './external-chat-mirror';
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

const AI_AGENT_CREDIT_FEATURE = 'chat' as const;
const AI_AGENT_MODEL_RATE_LIMIT = {
  maxRequests: 12,
  windowMs: 60_000,
} as const;

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

type AiAgentModelExecution =
  | {
      ok: true;
      cappedMaxOutput: number | null;
      modelId: string;
    }
  | {
      ok: false;
      reason: string;
    };

function bareGoogleModel(modelId: string) {
  return modelId.split('/').at(-1) || 'gemini-3.1-flash-lite';
}

function buildAiAgentModelRateLimitKey({
  channel,
  userId,
}: {
  channel: AiAgentChannelConfig;
  userId: string;
}) {
  return `ai-agent:model:${channel.workspaceId}:${channel.id}:${userId}`;
}

function creditFailureReason(errorMessage: string | null) {
  return (
    errorMessage ||
    'This workspace does not have enough AI credits for the agent to respond.'
  );
}

function modelResolutionFailureReason(error: unknown) {
  if (error instanceof PlanModelResolutionError) {
    return error.code === 'NO_ALLOCATION'
      ? 'This workspace is not configured for AI usage yet.'
      : 'The configured AI agent model is not available for this workspace.';
  }

  return 'The AI agent could not verify this workspace AI model allowance.';
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

function isPersonalZaloChannel(channel: AiAgentChannelConfig) {
  return channel.adapter === 'zalo' && channel.zaloAccountMode === 'personal';
}

function getZaloProviderAccountId(channel: AiAgentChannelConfig) {
  return isPersonalZaloChannel(channel)
    ? channel.zaloPersonalOwnId || channel.id
    : channel.zaloOfficialAccountId || channel.id;
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
  message: SdkMessage;
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
          providerAccountId: getZaloProviderAccountId(channel),
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

async function prepareAiAgentModelExecution({
  agent,
  channel,
  mappedUser,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  mappedUser: Extract<MappedPlatformUser, { ok: true }>;
}): Promise<AiAgentModelExecution> {
  const rateLimit = await checkRateLimitRedis(
    buildAiAgentModelRateLimitKey({
      channel,
      userId: mappedUser.userId,
    }),
    AI_AGENT_MODEL_RATE_LIMIT
  );

  if (!rateLimit.allowed) {
    return {
      ok: false,
      reason:
        'This Tuturuuu agent is receiving messages too quickly. Please try again in a moment.',
    };
  }

  let modelId: string;
  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      requestedModel: agent.modelId,
      wsId: channel.workspaceId,
    });
    modelId = resolvedModel.modelId;
  } catch (error) {
    return {
      ok: false,
      reason: modelResolutionFailureReason(error),
    };
  }

  const creditCheck = await checkAiCredits(
    channel.workspaceId,
    modelId,
    AI_AGENT_CREDIT_FEATURE,
    {
      userId: mappedUser.userId,
    }
  );

  if (!creditCheck.allowed) {
    return {
      ok: false,
      reason: creditFailureReason(creditCheck.errorMessage),
    };
  }

  const sbAdmin = await createAdminClient();
  const cappedMaxOutput = await capMaxOutputTokensByCredits(
    sbAdmin,
    modelId,
    creditCheck.maxOutputTokens,
    creditCheck.remainingCredits
  );

  if (cappedMaxOutput === null) {
    return {
      ok: false,
      reason: creditFailureReason('AI credits insufficient.'),
    };
  }

  return {
    ok: true,
    cappedMaxOutput,
    modelId,
  };
}

function createAiAgentCreditDeduction({
  agent,
  channel,
  message,
  modelId,
  userId,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  message: SdkMessage;
  modelId: string;
  userId: string;
}) {
  return async ({ totalUsage }: { totalUsage: LanguageModelUsage }) => {
    const inputTokens = totalUsage.inputTokens ?? 0;
    const outputTokens = totalUsage.outputTokens ?? 0;
    const reasoningTokens =
      totalUsage.outputTokenDetails?.reasoningTokens ??
      totalUsage.reasoningTokens ??
      0;

    if (inputTokens <= 0 && outputTokens <= 0 && reasoningTokens <= 0) {
      return;
    }

    try {
      const result = await deductAiCredits({
        feature: AI_AGENT_CREDIT_FEATURE,
        inputTokens,
        metadata: {
          adapter: channel.adapter,
          agentId: agent.id,
          channelId: channel.id,
          externalMessageId: message.id ?? null,
          source: 'ai_agent_webhook',
        },
        modelId,
        outputTokens,
        reasoningTokens,
        userId,
        wsId: channel.workspaceId,
      });

      if (!result.success) {
        serverLogger.warn('AI agent credit deduction returned no charge', {
          agentId: agent.id,
          channelId: channel.id,
          errorCode: result.errorCode,
          userId,
          wsId: channel.workspaceId,
        });
      }
    } catch (error) {
      serverLogger.warn('Failed to deduct AI agent credits', {
        agentId: agent.id,
        channelId: channel.id,
        error: error instanceof Error ? error.message : String(error),
        userId,
        wsId: channel.workspaceId,
      });
    }
  };
}

async function respondWithAgent({
  agent,
  channel,
  message,
  thread,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
  message: SdkMessage;
  thread: ChatThread;
}): Promise<SdkSentMessage | null> {
  const mappedUser = await resolveMappedPlatformUser({ channel, message });

  if (!mappedUser.ok) {
    return await thread.post(mappedUser.reason);
  }

  const execution = await prepareAiAgentModelExecution({
    agent,
    channel,
    mappedUser,
  });

  if (!execution.ok) {
    return await thread.post(execution.reason);
  }

  await thread.startTyping();

  const tools = await createAgentTools({
    agent,
    channel,
    mappedUser,
  });
  const modelWithMemory = await withAiMemory({
    customId: `${channel.id}-${message.id ?? Date.now()}`,
    model: google(bareGoogleModel(execution.modelId)),
    product: 'ai_agents',
    source: channel.adapter,
    surface: 'ai_agent_runtime',
    userId: mappedUser.userId,
    wsId: channel.workspaceId,
  });
  const toolAgent = new ToolLoopAgent({
    instructions: `${agent.instructions}

Channel: ${channel.displayName} (${channel.adapter})
Workspace ID: ${channel.workspaceId}
Mapped Tuturuuu user ID: ${mappedUser.userId}

Only use the configured task and calendar tools. If a tool returns a permission error, explain that the mapped Tuturuuu user needs the relevant workspace permission.`,
    model: modelWithMemory,
    ...(execution.cappedMaxOutput
      ? { maxOutputTokens: execution.cappedMaxOutput }
      : {}),
    onFinish: createAiAgentCreditDeduction({
      agent,
      channel,
      message,
      modelId: execution.modelId,
      userId: mappedUser.userId,
    }),
    stopWhen: stepCountIs(8),
    temperature: agent.temperature ?? undefined,
    tools,
  });

  const result = await toolAgent.stream({
    prompt: message.text || '[No text content]',
  });

  return await thread.post(result.fullStream);
}

type AiAgentRuntimeBundle = {
  chat: Awaited<ReturnType<typeof createChatSdkRuntime>>;
  personalZaloAdapter: ZaloPersonalAdapter | null;
};

async function createAiAgentChatRuntimeBundle({
  agent,
  channel,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
}): Promise<AiAgentRuntimeBundle> {
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

  const personalZaloAdapter = isPersonalZaloChannel(channel)
    ? createZaloPersonalAdapter({
        channelId: channel.id,
        cookieJson: secrets.personalCookieJson ?? '',
        displayName: channel.displayName,
        imei: secrets.personalImei ?? '',
        language: 'vi',
        ownId: channel.zaloPersonalOwnId ?? undefined,
        userAgent: secrets.personalUserAgent ?? '',
      })
    : null;

  const chat = await createChatSdkRuntime({
    adapters: {
      [channel.adapter]:
        personalZaloAdapter ?? adapterConfig({ channel, secrets }),
    },
    concurrency: 'queue',
    dedupeTtlMs: 600_000,
    logger: 'silent',
    state,
    userName: channel.displayName || agent.name,
  });

  const handler = async (thread: ChatThread, message: SdkMessage) => {
    try {
      await persistAiAgentExternalSdkMessage({
        agent,
        channel,
        direction: message.author.isMe ? 'outbound' : 'inbound',
        message,
        platformUserId: null,
        thread,
      });

      if (channel.autoRespond === false) {
        await markAiAgentChannelEvent({
          agentId: agent.id,
          channelId: channel.id,
        });
        return;
      }

      const sent = await respondWithAgent({ agent, channel, message, thread });
      if (sent) {
        await persistAiAgentExternalSdkMessage({
          agent,
          channel,
          direction: 'outbound',
          message: sent,
          platformUserId: null,
          thread,
        });
      }
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
      const sent = await thread.post(
        'The Tuturuuu agent could not complete this request.'
      );
      await persistAiAgentExternalSdkMessage({
        agent,
        channel,
        direction: 'outbound',
        message: sent,
        platformUserId: null,
        thread,
      });
    }
  };

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await handler(thread, message);
  });
  chat.onSubscribedMessage(handler);

  return { chat, personalZaloAdapter };
}

export async function createAiAgentChatRuntime({
  agent,
  channel,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
}) {
  const { chat } = await createAiAgentChatRuntimeBundle({ agent, channel });

  return chat;
}

export async function createAiAgentPersonalZaloRuntime({
  agent,
  channel,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
}) {
  const bundle = await createAiAgentChatRuntimeBundle({ agent, channel });

  if (!bundle.personalZaloAdapter) {
    throw new Error('ai_agent_zalo_personal_channel_required');
  }

  return {
    adapter: bundle.personalZaloAdapter,
    chat: bundle.chat,
  };
}

export function assertWebhookAdapter(value: string): AiAgentAdapter {
  if (value === 'discord' || value === 'zalo') {
    return value;
  }

  throw new Error('Unknown AI agent adapter.');
}
