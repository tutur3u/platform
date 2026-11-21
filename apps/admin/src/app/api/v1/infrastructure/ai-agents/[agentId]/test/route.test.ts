import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAiAgentChannelRequiredSecrets: vi.fn(),
  getAiAgentById: vi.fn(),
  isAiAgentZaloPersonalEnabled: vi.fn(),
  requireAiAgentAdmin: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/ai-agents/registry', () => ({
  getAiAgentChannelRequiredSecrets: (...args: unknown[]) =>
    mocks.getAiAgentChannelRequiredSecrets(...args),
  getAiAgentById: (...args: unknown[]) => mocks.getAiAgentById(...args),
  isAiAgentZaloPersonalEnabled: (...args: unknown[]) =>
    mocks.isAiAgentZaloPersonalEnabled(...args),
}));

vi.mock('../../access', () => ({
  requireAiAgentAdmin: (...args: unknown[]) =>
    mocks.requireAiAgentAdmin(...args),
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
    autoRespond: true,
    discordGuildId: 'guild-1',
    displayName: 'Discord',
    enabled: true,
    externalChannelId: 'channel-1',
    historySyncEnabled: true,
    id: 'channel-1',
    lastDeployedAt: '2026-06-02T00:00:00.000Z',
    lastError: null,
    lastEventAt: '2026-06-02T00:01:00.000Z',
    mentionRoleIds: [],
    secrets: [
      { configured: true, lastFour: '1111', name: 'applicationId' },
      { configured: true, lastFour: '2222', name: 'publicKey' },
      { configured: true, lastFour: '3333', name: 'botToken' },
    ],
    status: 'deployed',
    webhookUrl:
      'https://example.com/api/v1/webhooks/ai-agents/discord/channel-1',
    workspaceId: 'workspace-1',
    ...overrides,
  };
}

function agent(overrides: Record<string, unknown> = {}) {
  return {
    channels: [channel()],
    createdAt: '2026-06-02T00:00:00.000Z',
    enabled: true,
    id: 'agent-1',
    instructions: 'Help users.',
    modelId: 'google/gemini-3.1-flash-lite',
    name: 'Support Agent',
    temperature: null,
    tools: [],
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  };
}

async function callRoute(body: Record<string, unknown> = {}) {
  const { POST } = await import('./route');
  const request = new Request('http://localhost/test', {
    body: JSON.stringify({ channelId: 'channel-1', ...body }),
    method: 'POST',
  }) as unknown as NextRequest;
  Object.assign(request, { nextUrl: new URL('http://localhost/test') });

  return POST(request, {
    params: Promise.resolve({ agentId: 'agent-1' }),
  });
}

describe('AI agent channel test route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAiAgentAdmin.mockResolvedValue({
      ok: true,
      sbAdmin: { id: 'admin-client' },
    });
    mocks.getAiAgentChannelRequiredSecrets.mockImplementation((input) =>
      input.adapter === 'discord'
        ? ['applicationId', 'publicKey', 'botToken']
        : input.zaloAccountMode === 'personal'
          ? ['personalCookieJson', 'personalImei', 'personalUserAgent']
          : ['botToken', 'webhookSecret']
    );
    mocks.getAiAgentById.mockResolvedValue(agent());
    mocks.isAiAgentZaloPersonalEnabled.mockResolvedValue(true);
  });

  it('returns structured diagnostics for a deployed channel', async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({ id: 'agent_enabled', ok: true }),
        expect.objectContaining({ id: 'channel_enabled', ok: true }),
        expect.objectContaining({ id: 'channel_deployed', ok: true }),
        expect.objectContaining({ id: 'required_secrets', ok: true }),
        expect.objectContaining({ id: 'webhook_url', ok: true }),
        expect.objectContaining({ id: 'workspace_mapping', ok: true }),
      ]),
      ok: true,
    });
  });

  it('marks missing required channel secrets as a failed diagnostic', async () => {
    mocks.getAiAgentById.mockResolvedValue(
      agent({
        channels: [
          channel({
            secrets: [
              { configured: true, lastFour: '1111', name: 'applicationId' },
              { configured: false, lastFour: null, name: 'publicKey' },
              { configured: true, lastFour: '3333', name: 'botToken' },
            ],
          }),
        ],
      })
    );

    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringContaining('publicKey'),
          id: 'required_secrets',
          ok: false,
        }),
      ]),
      ok: false,
    });
  });

  it('checks personal Zalo feature flag and personal credentials', async () => {
    mocks.getAiAgentById.mockResolvedValue(
      agent({
        channels: [
          channel({
            adapter: 'zalo',
            discordGuildId: null,
            secrets: [
              {
                configured: true,
                lastFour: 'json',
                name: 'personalCookieJson',
              },
              { configured: true, lastFour: 'mei1', name: 'personalImei' },
              {
                configured: true,
                lastFour: 'ent1',
                name: 'personalUserAgent',
              },
            ],
            webhookUrl:
              'https://example.com/api/v1/webhooks/ai-agents/zalo/channel-1',
            zaloAccountMode: 'personal',
            zaloPersonalOwnId: 'own-1',
          }),
        ],
      })
    );
    mocks.isAiAgentZaloPersonalEnabled.mockResolvedValue(false);

    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: 'zalo_personal_feature_flag',
          ok: false,
        }),
        expect.objectContaining({
          id: 'listener_lifecycle',
          ok: true,
        }),
        expect.objectContaining({
          id: 'adapter_account',
          ok: true,
        }),
      ]),
      ok: false,
    });
  });
});
