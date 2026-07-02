import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capMaxOutputTokensByCredits: vi.fn(),
  checkAiCredits: vi.fn(),
  checkRateLimitRedis: vi.fn(),
  createAdminClient: vi.fn(),
  createChatSdkRuntime: vi.fn(),
  createMiraStreamTools: vi.fn(),
  createZaloPersonalAdapter: vi.fn(),
  deductAiCredits: vi.fn(),
  getChannelSecretValues: vi.fn(),
  getPermissions: vi.fn(),
  getRootSecretValue: vi.fn(),
  google: vi.fn(),
  onNewMention: null as null | ((thread: unknown, message: unknown) => unknown),
  onSubscribedMessage: null as
    | null
    | ((thread: unknown, message: unknown) => unknown),
  persistAiAgentExternalSdkMessage: vi.fn(),
  resolvePlanModel: vi.fn(),
  resolveZaloIdentity: vi.fn(),
  serverWarn: vi.fn(),
  stream: vi.fn(),
  toolLoopSettings: null as null | Record<string, unknown>,
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('@tuturuuu/ai/chat-sdk', () => ({
  createChatSdkRuntime: (
    ...args: Parameters<typeof mocks.createChatSdkRuntime>
  ) => mocks.createChatSdkRuntime(...args),
}));

vi.mock('@tuturuuu/ai/chat-sdk/zalo-personal', () => ({
  createZaloPersonalAdapter: (
    ...args: Parameters<typeof mocks.createZaloPersonalAdapter>
  ) => mocks.createZaloPersonalAdapter(...args),
}));

vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: (
    ...args: Parameters<typeof mocks.capMaxOutputTokensByCredits>
  ) => mocks.capMaxOutputTokensByCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
}));

vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => {
  class PlanModelResolutionError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'PlanModelResolutionError';
      this.code = code;
    }
  }

  return {
    PlanModelResolutionError,
    resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
      mocks.resolvePlanModel(...args),
  };
});

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

vi.mock('@tuturuuu/ai/tools/mira-tools', () => ({
  createMiraStreamTools: (
    ...args: Parameters<typeof mocks.createMiraStreamTools>
  ) => mocks.createMiraStreamTools(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: true,
}));

vi.mock('ai', () => ({
  stepCountIs: (steps: number) => ({ steps }),
  ToolLoopAgent: class ToolLoopAgent {
    constructor(settings: Record<string, unknown>) {
      mocks.toolLoopSettings = settings;
    }

    stream(args: Record<string, unknown>) {
      return mocks.stream(args);
    }
  },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: Parameters<typeof mocks.serverWarn>) =>
      mocks.serverWarn(...args),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitRedis: (
    ...args: Parameters<typeof mocks.checkRateLimitRedis>
  ) => mocks.checkRateLimitRedis(...args),
}));

vi.mock('./external-chat-mirror', () => ({
  persistAiAgentExternalSdkMessage: (
    ...args: Parameters<typeof mocks.persistAiAgentExternalSdkMessage>
  ) => mocks.persistAiAgentExternalSdkMessage(...args),
}));

vi.mock('./registry', () => ({
  getChannelSecretValues: (
    ...args: Parameters<typeof mocks.getChannelSecretValues>
  ) => mocks.getChannelSecretValues(...args),
  getRootSecretValue: (...args: Parameters<typeof mocks.getRootSecretValue>) =>
    mocks.getRootSecretValue(...args),
  markAiAgentChannelEvent: vi.fn(),
  resolveZaloIdentity: (
    ...args: Parameters<typeof mocks.resolveZaloIdentity>
  ) => mocks.resolveZaloIdentity(...args),
}));

import { createAiAgentChatRuntime } from './runtime';

const adminClient = {
  schema: vi.fn(),
};

const agent = {
  channels: [],
  createdAt: null,
  enabled: true,
  id: 'agent-1',
  instructions: 'Help mapped users.',
  modelId: 'google/gemini-3.1-flash-lite',
  name: 'Support Agent',
  temperature: null,
  tools: [],
  updatedAt: null,
};

const channel = {
  adapter: 'zalo' as const,
  autoRespond: true,
  displayName: 'Zalo Support',
  enabled: true,
  externalChannelId: null,
  historySyncEnabled: true,
  id: 'channel-1',
  lastDeployedAt: null,
  lastError: null,
  lastEventAt: null,
  mentionRoleIds: [],
  secrets: [],
  status: 'deployed' as const,
  webhookUrl: null,
  workspaceId: 'workspace-1',
  zaloOfficialAccountId: 'oa-1',
};

const externalMessage = {
  author: {
    isBot: false,
    isMe: false,
    userId: 'zalo-user-1',
  },
  id: 'external-message-1',
  text: 'Can you help?',
};

function createThread() {
  return {
    post: vi.fn(async (content: unknown) => ({
      author: { isMe: true, userId: 'agent' },
      id: 'sent-message-1',
      text: content,
    })),
    startTyping: vi.fn(),
    subscribe: vi.fn(),
  };
}

async function registerRuntime() {
  await createAiAgentChatRuntime({ agent, channel });
  expect(mocks.onSubscribedMessage).toBeTypeOf('function');
  return mocks.onSubscribedMessage as NonNullable<
    typeof mocks.onSubscribedMessage
  >;
}

describe('AI agent runtime billing controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onNewMention = null;
    mocks.onSubscribedMessage = null;
    mocks.toolLoopSettings = null;

    mocks.createAdminClient.mockResolvedValue(adminClient);
    mocks.getChannelSecretValues.mockResolvedValue({
      botToken: 'bot-token',
      webhookSecret: 'webhook-secret',
    });
    mocks.getRootSecretValue.mockResolvedValue(null);
    mocks.createChatSdkRuntime.mockResolvedValue({
      onNewMention: vi.fn((callback) => {
        mocks.onNewMention = callback;
      }),
      onSubscribedMessage: vi.fn((callback) => {
        mocks.onSubscribedMessage = callback;
      }),
    });
    mocks.resolveZaloIdentity.mockResolvedValue('user-1');
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.checkRateLimitRedis.mockResolvedValue({
      allowed: true,
      limit: 12,
      remaining: 11,
      reset: 1_700_000_000,
    });
    mocks.resolvePlanModel.mockResolvedValue({
      allocationId: 'allocation-1',
      modelId: 'google/gemini-3.1-flash-lite',
      source: 'requested',
      tier: 'FREE',
    });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
      maxOutputTokens: 256,
      remainingCredits: 25,
      tier: 'FREE',
    });
    mocks.capMaxOutputTokensByCredits.mockResolvedValue(128);
    mocks.createMiraStreamTools.mockReturnValue({
      create_task: {},
      get_my_tasks: {},
    });
    mocks.google.mockReturnValue({ model: 'gemini-3.1-flash-lite' });
    mocks.withAiMemory.mockImplementation(async ({ model }) => model);
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      errorCode: null,
      remainingCredits: 24,
      success: true,
    });
    mocks.stream.mockImplementation(async () => {
      const onFinish = mocks.toolLoopSettings?.onFinish as
        | undefined
        | ((event: unknown) => Promise<void>);
      await onFinish?.({
        totalUsage: {
          inputTokenDetails: {
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
            noCacheTokens: undefined,
          },
          inputTokens: 11,
          outputTokenDetails: {
            reasoningTokens: 2,
            textTokens: 5,
          },
          outputTokens: 7,
          reasoningTokens: 2,
          totalTokens: 18,
        },
      });

      return { fullStream: 'agent-stream' };
    });
  });

  it('checks allowance, caps output, and deducts usage for mapped webhook messages', async () => {
    const handler = await registerRuntime();
    const thread = createThread();

    await handler(thread, externalMessage);

    expect(mocks.checkRateLimitRedis).toHaveBeenCalledWith(
      'ai-agent:model:workspace-1:channel-1:user-1',
      { maxRequests: 12, windowMs: 60_000 }
    );
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith({
      capability: 'language',
      requestedModel: 'google/gemini-3.1-flash-lite',
      wsId: 'workspace-1',
    });
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      'workspace-1',
      'google/gemini-3.1-flash-lite',
      'chat',
      { userId: 'user-1' }
    );
    expect(mocks.capMaxOutputTokensByCredits).toHaveBeenCalledWith(
      adminClient,
      'google/gemini-3.1-flash-lite',
      256,
      25
    );
    expect(mocks.google).toHaveBeenCalledWith('gemini-3.1-flash-lite');
    expect(mocks.toolLoopSettings).toEqual(
      expect.objectContaining({
        maxOutputTokens: 128,
      })
    );
    expect(thread.startTyping).toHaveBeenCalledOnce();
    expect(thread.post).toHaveBeenCalledWith('agent-stream');
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'chat',
        inputTokens: 11,
        metadata: expect.objectContaining({
          adapter: 'zalo',
          agentId: 'agent-1',
          channelId: 'channel-1',
          externalMessageId: 'external-message-1',
          source: 'ai_agent_webhook',
        }),
        modelId: 'google/gemini-3.1-flash-lite',
        outputTokens: 7,
        reasoningTokens: 2,
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    );
  });

  it('posts a credit denial without invoking the model', async () => {
    mocks.checkAiCredits.mockResolvedValueOnce({
      allowed: false,
      errorCode: 'CREDITS_EXHAUSTED',
      errorMessage: 'AI credits exhausted.',
      maxOutputTokens: null,
      remainingCredits: 0,
      tier: 'FREE',
    });
    const handler = await registerRuntime();
    const thread = createThread();

    await handler(thread, externalMessage);

    expect(thread.post).toHaveBeenCalledWith('AI credits exhausted.');
    expect(thread.startTyping).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('denies execution when no output tokens can be afforded', async () => {
    mocks.capMaxOutputTokensByCredits.mockResolvedValueOnce(null);
    const handler = await registerRuntime();
    const thread = createThread();

    await handler(thread, externalMessage);

    expect(thread.post).toHaveBeenCalledWith('AI credits insufficient.');
    expect(thread.startTyping).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.deductAiCredits).not.toHaveBeenCalled();
  });

  it('rate-limits mapped users before credit checks and provider calls', async () => {
    mocks.checkRateLimitRedis.mockResolvedValueOnce({
      allowed: false,
      limit: 12,
      remaining: 0,
      reset: 1_700_000_000,
    });
    const handler = await registerRuntime();
    const thread = createThread();

    await handler(thread, externalMessage);

    expect(thread.post).toHaveBeenCalledWith(
      'This Tuturuuu agent is receiving messages too quickly. Please try again in a moment.'
    );
    expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
    expect(mocks.checkAiCredits).not.toHaveBeenCalled();
    expect(thread.startTyping).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('uses a zca-js personal adapter for personal Zalo channels', async () => {
    const personalAdapter = {
      handleWebhook: vi.fn(),
      name: 'zalo',
    };
    mocks.createZaloPersonalAdapter.mockReturnValueOnce(personalAdapter);
    mocks.getChannelSecretValues.mockResolvedValueOnce({
      personalCookieJson: '[{"name":"zpsid","value":"cookie"}]',
      personalImei: 'imei-1',
      personalUserAgent: 'agent-1',
    });

    await createAiAgentChatRuntime({
      agent,
      channel: {
        ...channel,
        zaloAccountMode: 'personal',
        zaloPersonalOwnId: 'own-1',
      },
    });

    expect(mocks.createZaloPersonalAdapter).toHaveBeenCalledWith({
      channelId: 'channel-1',
      cookieJson: '[{"name":"zpsid","value":"cookie"}]',
      displayName: 'Zalo Support',
      imei: 'imei-1',
      language: 'vi',
      ownId: 'own-1',
      userAgent: 'agent-1',
    });
    expect(mocks.createChatSdkRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        adapters: {
          zalo: personalAdapter,
        },
      })
    );
  });
});
