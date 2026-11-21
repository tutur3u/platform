import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getRootSecretValue: vi.fn(),
  listAiAgents: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@/lib/ai-agents/registry', () => ({
  getRootSecretValue: (...args: unknown[]) => mocks.getRootSecretValue(...args),
  listAiAgents: (...args: unknown[]) => mocks.listAiAgents(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    warn: (...args: unknown[]) => mocks.warn(...args),
  },
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const ADMIN_CLIENT = { id: 'admin-client' };
const WATCHER_SECRET = 'watcher-secret';

function channel(overrides: Record<string, unknown> = {}) {
  return {
    adapter: 'discord',
    autoRespond: true,
    discordGuildId: 'guild-1',
    displayName: 'Discord',
    enabled: true,
    externalChannelId: 'external-channel-1',
    historySyncEnabled: true,
    id: 'root-discord',
    lastDeployedAt: '2026-06-03T00:00:00.000Z',
    lastError: null,
    lastEventAt: null,
    mentionRoleIds: [],
    secrets: [],
    status: 'deployed',
    webhookUrl:
      'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/root-discord',
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
  auth = `Bearer ${WATCHER_SECRET}`,
  url = 'https://tuturuuu.com/api/v1/infrastructure/ai-agents/discord-gateway/watcher-config',
}: {
  auth?: string | null;
  url?: string;
} = {}) {
  const { GET } = await import('./route');
  const headers = new Headers();

  if (auth) {
    headers.set('authorization', auth);
  }

  const request = new Request(url, {
    headers,
    method: 'GET',
  }) as unknown as NextRequest;
  Object.assign(request, { nextUrl: new URL(url) });

  return GET(request);
}

describe('Discord Gateway watcher config route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.createAdminClient.mockResolvedValue(ADMIN_CLIENT);
    mocks.getRootSecretValue.mockResolvedValue(WATCHER_SECRET);
    mocks.listAiAgents.mockResolvedValue([agent()]);
  });

  it('rejects requests without watcher credentials', async () => {
    const response = await callRoute({ auth: null });

    expect(response.status).toBe(401);
    expect(mocks.listAiAgents).not.toHaveBeenCalled();
  });

  it('fails closed when the root watcher secret is missing', async () => {
    mocks.getRootSecretValue.mockResolvedValue(null);

    const response = await callRoute();

    expect(response.status).toBe(500);
    expect(mocks.listAiAgents).not.toHaveBeenCalled();
  });

  it('returns only enabled deployed root-workspace Discord targets', async () => {
    mocks.listAiAgents.mockResolvedValue([
      agent({
        channels: [
          channel(),
          channel({
            id: 'non-root-discord',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/non-root-discord',
            workspaceId: 'workspace-1',
          }),
          channel({
            id: 'paused-discord',
            status: 'paused',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/paused-discord',
          }),
          channel({
            adapter: 'zalo',
            id: 'root-zalo',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/zalo/root-zalo',
          }),
          channel({
            discordGuildId: null,
            externalChannelId: null,
            id: 'unscoped-root-discord',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/unscoped-root-discord',
          }),
        ],
      }),
      agent({
        enabled: false,
        id: 'disabled-agent',
        channels: [
          channel({
            id: 'disabled-agent-channel',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/disabled-agent-channel',
          }),
        ],
      }),
    ]);

    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      targets: [
        {
          agentId: 'agent-1',
          channelId: 'root-discord',
          discordGuildId: 'guild-1',
          externalChannelId: 'external-channel-1',
          webhookUrl:
            'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/root-discord',
          workspaceId: ROOT_WORKSPACE_ID,
        },
      ],
    });
    expect(mocks.listAiAgents).toHaveBeenCalledWith({
      db: ADMIN_CLIENT,
      origin: 'https://tuturuuu.com',
    });
  });

  it('can filter the root deployed Discord target by channel id', async () => {
    mocks.listAiAgents.mockResolvedValue([
      agent({
        channels: [
          channel(),
          channel({
            id: 'secondary-root-discord',
            webhookUrl:
              'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/secondary-root-discord',
          }),
        ],
      }),
    ]);

    const response = await callRoute({
      url: 'https://tuturuuu.com/api/v1/infrastructure/ai-agents/discord-gateway/watcher-config?channelId=SECONDARY-ROOT-DISCORD',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      targets: [
        {
          channelId: 'secondary-root-discord',
          webhookUrl:
            'https://tuturuuu.com/api/v1/webhooks/ai-agents/discord/secondary-root-discord',
          workspaceId: ROOT_WORKSPACE_ID,
        },
      ],
    });
  });
});
