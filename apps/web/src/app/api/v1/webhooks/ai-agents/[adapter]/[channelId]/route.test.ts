import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertWebhookAdapter: vi.fn(),
  createAiAgentChatRuntime: vi.fn(),
  getAiAgentChannelById: vi.fn(),
  webhookHandler: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/ai-agents/registry', () => ({
  getAiAgentChannelById: (...args: unknown[]) =>
    mocks.getAiAgentChannelById(...args),
}));

vi.mock('@/lib/ai-agents/runtime', () => ({
  assertWebhookAdapter: (...args: unknown[]) =>
    mocks.assertWebhookAdapter(...args),
  createAiAgentChatRuntime: (...args: unknown[]) =>
    mocks.createAiAgentChatRuntime(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: unknown[]) => mocks.warn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

function channel(overrides: Record<string, unknown> = {}) {
  return {
    adapter: 'discord',
    discordGuildId: 'guild-1',
    displayName: 'Discord',
    enabled: true,
    externalChannelId: 'discord-channel-1',
    id: 'discord-channel',
    lastDeployedAt: '2026-06-03T00:00:00.000Z',
    lastError: null,
    lastEventAt: null,
    mentionRoleIds: [],
    secrets: [],
    status: 'deployed',
    webhookUrl:
      'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/discord-channel',
    workspaceId: ROOT_WORKSPACE_ID,
    ...overrides,
  };
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    channels: [channel()],
    createdAt: '2026-06-03T00:00:00.000Z',
    enabled: true,
    id: 'agent-1',
    instructions: 'Help users.',
    modelId: 'google/gemini-3.1-flash-lite',
    name: 'Support Agent',
    temperature: null,
    tools: [],
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...overrides,
  };
}

async function callRoute({
  body = {
    data: {
      channel_id: 'discord-channel-1',
      guild_id: 'guild-1',
      id: 'message-1',
    },
    timestamp: 1_718_000_000_000,
    type: 'GATEWAY_MESSAGE_CREATE',
  },
  gatewayToken = 'gateway-token',
}: {
  body?: unknown;
  gatewayToken?: string | null;
} = {}) {
  const { POST } = await import('./route');
  const headers = new Headers();

  if (gatewayToken) {
    headers.set('x-discord-gateway-token', gatewayToken);
  }

  const request = new Request(
    'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/discord-channel',
    {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    }
  ) as unknown as NextRequest;
  Object.assign(request, { nextUrl: new URL(request.url) });

  return POST(request, {
    params: Promise.resolve({
      adapter: 'discord',
      channelId: 'discord-channel',
    }),
  });
}

describe('AI agent webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertWebhookAdapter.mockReturnValue('discord');
    mocks.getAiAgentChannelById.mockResolvedValue({
      agent: agent(),
      channel: channel(),
    });
    mocks.webhookHandler.mockResolvedValue(Response.json({ ok: true }));
    mocks.createAiAgentChatRuntime.mockResolvedValue({
      webhooks: {
        discord: (...args: unknown[]) => mocks.webhookHandler(...args),
      },
    });
  });

  it('rejects Discord Gateway forwarded events for non-root workspaces', async () => {
    mocks.getAiAgentChannelById.mockResolvedValue({
      agent: agent(),
      channel: channel({ workspaceId: 'workspace-1' }),
    });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(mocks.createAiAgentChatRuntime).not.toHaveBeenCalled();
  });

  it('allows Discord Gateway forwarded events for the root internal workspace', async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(mocks.createAiAgentChatRuntime).toHaveBeenCalledWith({
      agent: agent(),
      channel: channel(),
    });
    expect(mocks.webhookHandler).toHaveBeenCalledOnce();
  });

  it('rejects Discord Gateway events from a different guild or channel', async () => {
    const response = await callRoute({
      body: {
        data: {
          channel_id: 'other-channel',
          guild_id: 'guild-1',
          id: 'message-1',
        },
        timestamp: 1_718_000_000_000,
        type: 'GATEWAY_MESSAGE_CREATE',
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error:
        'Discord Gateway event does not match the configured AI agent channel',
    });
    expect(mocks.createAiAgentChatRuntime).not.toHaveBeenCalled();
  });

  it('allows Discord Gateway thread events under the configured channel', async () => {
    const response = await callRoute({
      body: {
        data: {
          channel_id: 'thread-1',
          guild_id: 'guild-1',
          id: 'message-1',
          thread: {
            id: 'thread-1',
            parent_id: 'discord-channel-1',
          },
        },
        timestamp: 1_718_000_000_000,
        type: 'GATEWAY_MESSAGE_CREATE',
      },
    });

    expect(response.status).toBe(200);
    expect(mocks.webhookHandler).toHaveBeenCalledOnce();
  });

  it('rejects Discord Gateway events when the channel has no Discord binding', async () => {
    mocks.getAiAgentChannelById.mockResolvedValue({
      agent: agent(),
      channel: channel({ discordGuildId: null }),
    });

    const response = await callRoute();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error:
        'Discord Gateway forwarding requires a configured guild and channel binding',
    });
    expect(mocks.createAiAgentChatRuntime).not.toHaveBeenCalled();
  });

  it('keeps normal non-Gateway Discord webhooks available for configured channels', async () => {
    mocks.getAiAgentChannelById.mockResolvedValue({
      agent: agent(),
      channel: channel({ workspaceId: 'workspace-1' }),
    });

    const response = await callRoute({ gatewayToken: null });

    expect(response.status).toBe(200);
    expect(mocks.webhookHandler).toHaveBeenCalledOnce();
  });
});
