import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listRootAiAgentDiscoveryConversations } from './agent-discovery';

vi.mock('server-only', () => ({}));

const mocks = {
  listAiAgents: vi.fn(),
};

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
});
