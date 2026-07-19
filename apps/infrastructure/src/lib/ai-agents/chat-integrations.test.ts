import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatIntegrationChannel } from './chat-integrations';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  SaveAiAgentInput,
} from './types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getAiAgentById: vi.fn(),
  saveAiAgent: vi.fn(),
}));

vi.mock('./registry', () => ({
  getAiAgentById: (...args: Parameters<typeof mocks.getAiAgentById>) =>
    mocks.getAiAgentById(...args),
  saveAiAgent: (...args: Parameters<typeof mocks.saveAiAgent>) =>
    mocks.saveAiAgent(...args),
}));

describe('chat integration AI-agent channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiAgentById.mockResolvedValue(null);
    mocks.saveAiAgent.mockImplementation(
      async ({ payload }: { payload: SaveAiAgentInput }) =>
        agentFromPayload(payload)
    );
  });

  it('creates a deterministic personal Zalo managed channel', async () => {
    const result = await createChatIntegrationChannel({
      actorUserId: 'user-1',
      kind: 'zalo-personal',
      origin: 'https://chat.tuturuuu.localhost',
    });

    expect(mocks.saveAiAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        origin: 'https://chat.tuturuuu.localhost',
        payload: expect.objectContaining({
          enabled: true,
          id: 'chat-integrations',
          name: 'Chat Integrations',
        }),
      })
    );
    const payload = mocks.saveAiAgent.mock.calls[0]?.[0]
      .payload as SaveAiAgentInput;
    expect(payload.channels).toMatchObject([
      {
        adapter: 'zalo',
        autoRespond: false,
        displayName: 'Zalo Personal',
        enabled: true,
        historySyncEnabled: true,
        id: 'chat-zalo-personal',
        status: 'draft',
        workspaceId: ROOT_WORKSPACE_ID,
        zaloAccountMode: 'personal',
      },
    ]);
    expect(result.agent.id).toBe('chat-integrations');
    expect(result.channel.id).toBe('chat-zalo-personal');
    expect(result.conversationId).toMatch(/^ai-agent-[a-f0-9]{32}$/u);
  });

  it('reuses managed channels without dropping existing channel settings', async () => {
    mocks.getAiAgentById.mockResolvedValue(
      agent({
        channels: [
          channel({
            adapter: 'discord',
            displayName: 'Discord Main',
            discordGuildId: 'guild-1',
            enabled: false,
            externalChannelId: 'channel-1',
            id: 'chat-discord',
            secrets: [
              {
                configured: true,
                lastFour: 'abcd',
                name: 'discordBotToken',
              },
            ],
            status: 'paused',
          }),
          channel({
            adapter: 'zalo',
            displayName: 'Other Zalo',
            id: 'support-zalo',
            zaloAccountMode: 'official',
          }),
        ],
      })
    );

    const result = await createChatIntegrationChannel({
      actorUserId: 'user-1',
      displayName: 'Discord Support',
      kind: 'discord',
    });

    const payload = mocks.saveAiAgent.mock.calls[0]?.[0]
      .payload as SaveAiAgentInput;
    expect(payload.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adapter: 'zalo',
          id: 'support-zalo',
        }),
        expect.objectContaining({
          adapter: 'discord',
          displayName: 'Discord Support',
          discordGuildId: 'guild-1',
          enabled: false,
          externalChannelId: 'channel-1',
          id: 'chat-discord',
          status: 'paused',
        }),
      ])
    );
    expect(JSON.stringify(payload)).not.toContain('abcd');
    expect(JSON.stringify(result)).not.toContain('raw-secret');
  });

  it('preserves an explicitly enabled auto-response setting', async () => {
    mocks.getAiAgentById.mockResolvedValue(
      agent({
        channels: [
          channel({
            adapter: 'zalo',
            autoRespond: true,
            id: 'chat-zalo-personal',
            zaloAccountMode: 'personal',
          }),
        ],
      })
    );

    await createChatIntegrationChannel({
      actorUserId: 'user-1',
      kind: 'zalo-personal',
    });

    const payload = mocks.saveAiAgent.mock.calls[0]?.[0]
      .payload as SaveAiAgentInput;
    expect(payload.channels).toEqual([
      expect.objectContaining({
        autoRespond: true,
        id: 'chat-zalo-personal',
      }),
    ]);
  });
});

function agent(overrides: Partial<AiAgentDefinition> = {}): AiAgentDefinition {
  return {
    channels: [],
    createdAt: '2026-06-10T00:00:00.000Z',
    enabled: true,
    id: 'chat-integrations',
    instructions: 'Keep replies useful.',
    modelId: 'google/gemini-3.1-flash-lite',
    name: 'Chat Integrations',
    temperature: null,
    tools: [],
    updatedAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  };
}

function channel(
  overrides: Partial<AiAgentChannelConfig> = {}
): AiAgentChannelConfig {
  return {
    adapter: 'discord',
    displayName: 'Discord',
    enabled: true,
    id: 'chat-discord',
    lastDeployedAt: null,
    lastError: null,
    lastEventAt: null,
    mentionRoleIds: [],
    secrets: [],
    status: 'draft',
    webhookUrl: null,
    workspaceId: ROOT_WORKSPACE_ID,
    ...overrides,
  };
}

function agentFromPayload(payload: SaveAiAgentInput): AiAgentDefinition {
  return agent({
    channels:
      payload.channels?.map((item) =>
        channel({
          adapter: item.adapter,
          autoRespond: item.autoRespond,
          displayName: item.displayName ?? item.adapter,
          discordGuildId: item.discordGuildId,
          enabled: item.enabled ?? true,
          externalChannelId: item.externalChannelId,
          historySyncEnabled: item.historySyncEnabled,
          id: item.id,
          mentionRoleIds: item.mentionRoleIds ?? [],
          status: item.status ?? 'draft',
          workspaceId: item.workspaceId,
          zaloAccountMode: item.zaloAccountMode,
          zaloOfficialAccountId: item.zaloOfficialAccountId,
          zaloPersonalOwnId: item.zaloPersonalOwnId,
        })
      ) ?? [],
    enabled: payload.enabled ?? true,
    id: payload.id,
    instructions: payload.instructions ?? 'Keep replies useful.',
    modelId: payload.modelId ?? 'google/gemini-3.1-flash-lite',
    name: payload.name,
    temperature: payload.temperature ?? null,
    tools: payload.tools ?? [],
  });
}
