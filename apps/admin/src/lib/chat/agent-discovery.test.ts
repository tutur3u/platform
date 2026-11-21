import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteAiChatMessage,
  listAiChatConversations,
  listAiChatMessages,
  updateAiChatConversationTitle,
  listRootAiAgentDiscoveryConversations,
  toVirtualAiAgentConversationId,
} from './agent-discovery';

vi.mock('server-only', () => ({}));

const mocks = {
  createAdminClient: vi.fn(),
  listAiAgents: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@/lib/ai-agents/registry', () => ({
  listAiAgents: (...args: Parameters<typeof mocks.listAiAgents>) =>
    mocks.listAiAgents(...args),
}));

const agent = {
  channels: [
    {
      adapter: 'discord',
      displayName: 'Discord Main',
      enabled: true,
      id: 'discord-main',
      lastDeployedAt: '2026-06-01T00:00:00.000Z',
      lastError: null,
      lastEventAt: '2026-06-01T00:01:00.000Z',
      mentionRoleIds: [],
      secrets: [],
      status: 'deployed',
      webhookUrl: 'https://secret.example/webhook',
      workspaceId: ROOT_WORKSPACE_ID,
    },
  ],
  createdAt: '2026-06-01T00:00:00.000Z',
  enabled: true,
  id: 'ops-agent',
  instructions: 'Keep replies short.',
  modelId: 'google/gemini-3.1-flash-lite',
  name: 'Ops Agent',
  temperature: null,
  tools: [],
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('AI agent chat discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAiAgents.mockResolvedValue([agent]);
  });

  it('omits operational channel metadata for chat viewers', async () => {
    const [conversation] = await listRootAiAgentDiscoveryConversations({
      wsId: ROOT_WORKSPACE_ID,
    });

    expect(conversation).toBeDefined();
    expect(conversation?.id).toMatch(/^ai-agent-[a-f0-9]{32}$/u);
    expect(conversation?.id).not.toContain(agent.id);
    expect(conversation?.id).not.toContain(agent.channels[0]?.id);
    expect(conversation?.description).toBe('discord agent channel');
    expect(conversation?.metadata).toEqual({
      readOnly: true,
      source: 'ai-agent',
    });
    expect(conversation?.latestMessage?.metadata).toEqual({
      readOnly: true,
      source: 'ai-agent',
    });

    const payload = JSON.stringify(conversation);
    expect(payload).not.toContain('https://secret.example/webhook');
    expect(payload).not.toContain('webhookUrl');
    expect(payload).not.toContain('"status":');
    expect(payload).not.toContain('workspaceId');
    expect(payload).not.toContain('ops-agent');
    expect(payload).not.toContain('discord-main');
  });

  it('includes agent and channel IDs for root AI-agent admins only', async () => {
    const [conversation] = await listRootAiAgentDiscoveryConversations({
      includeAdminMetadata: true,
      wsId: ROOT_WORKSPACE_ID,
    });

    expect(conversation?.metadata).toEqual({
      agentId: 'ops-agent',
      channelId: 'discord-main',
      readOnly: true,
      source: 'ai-agent',
    });
    expect(conversation?.latestMessage?.metadata).toEqual({
      agentId: 'ops-agent',
      channelId: 'discord-main',
      readOnly: true,
      source: 'ai-agent',
    });

    const payload = JSON.stringify(conversation);
    expect(payload).not.toContain('https://secret.example/webhook');
    expect(payload).not.toContain('webhookUrl');
    expect(payload).not.toContain('"status":');
    expect(payload).not.toContain('workspaceId');
  });

  it('builds stable opaque virtual conversation IDs', () => {
    expect(toVirtualAiAgentConversationId('agent-1', 'channel-1')).toBe(
      toVirtualAiAgentConversationId('agent-1', 'channel-1')
    );
    expect(toVirtualAiAgentConversationId('agent-1', 'channel-1')).toMatch(
      /^ai-agent-[a-f0-9]{32}$/u
    );
    expect(toVirtualAiAgentConversationId('agent-1', 'channel-1')).not.toBe(
      toVirtualAiAgentConversationId('agent-1', 'channel-2')
    );
  });
});

it.each(['list', 'read', 'rename', 'delete'] as const)(
  "does not expose another actor's messages through the %s operation",
  async (operation) => {
    const actor = 'user-1';
    const wsId = 'personal-workspace';
    const foreignChat = { id: 'chat-1', creator_id: 'user-2' };
    let owner: string | undefined;
    const chatQuery = {
      eq: vi.fn((column: string, value: string) => {
        if (column === 'creator_id') owner = value;
        return chatQuery;
      }),
      is: vi.fn(() => chatQuery),
      limit: vi.fn(() => chatQuery),
      order: vi.fn(() => chatQuery),
      select: vi.fn(() => chatQuery),
      update: vi.fn(() => chatQuery),
      maybeSingle: vi.fn(async () => ({
        data: owner === foreignChat.creator_id ? foreignChat : null,
        error: null,
      })),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(
          resolve({
            data: owner === foreignChat.creator_id ? [foreignChat] : [],
            error: null,
          })
        ),
    };
    const workspaceQuery = {
      eq: vi.fn(() => workspaceQuery),
      maybeSingle: vi.fn(async () => ({ data: { id: wsId }, error: null })),
      select: vi.fn(() => workspaceQuery),
    };
    const adminFrom = vi.fn((table: string) => {
      if (table !== 'ai_chats') throw new Error('Unauthorized message query');
      return chatQuery;
    });
    mocks.createAdminClient.mockResolvedValue({ from: adminFrom });

    const input = {
      conversationId: 'ai-chat-chat-1',
      messageId: 'foreign-message',
      supabase: { from: vi.fn(() => workspaceQuery) } as never,
      title: 'Other title',
      user: { id: actor } as never,
      wsId,
    };
    const actions = {
      list: () => listAiChatConversations(input),
      read: () => listAiChatMessages(input),
      rename: () => updateAiChatConversationTitle(input),
      delete: () => deleteAiChatMessage(input),
    };

    await expect(actions[operation]()).resolves.toEqual(
      operation === 'list' ? [] : null
    );
    expect(chatQuery.eq).toHaveBeenCalledWith('creator_id', actor);
    expect(adminFrom.mock.calls).toEqual([['ai_chats']]);
  }
);
