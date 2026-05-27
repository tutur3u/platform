import { describe, expect, it, vi } from 'vitest';
import {
  createAIWhitelistDomain,
  createAIWhitelistEmail,
  deleteAIWhitelistDomain,
  deleteAIWhitelistEmail,
  deployAiAgentChannel,
  listAIWhitelistDomains,
  listAIWhitelistEmails,
  listAiAgents,
  listAiGatewayModelsPage,
  pauseAiAgentChannel,
  rotateAiAgentChannelSecret,
  saveAiAgent,
  saveAiAgentIdentityLink,
  testAiAgentChannel,
  updateAIWhitelistDomain,
  updateAIWhitelistEmail,
} from './infrastructure';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('AI whitelist domain internal API helpers', () => {
  it('lists domains through the apps/web API with pagination filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listAIWhitelistDomains(
      { page: 2, pageSize: 20, q: 'example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains?page=2&pageSize=20&q=example.com',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates domains through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          created_at: '2026-05-19T00:00:00Z',
          description: null,
          domain: 'example.com',
          enabled: true,
        },
      })
    );

    await createAIWhitelistDomain(
      {
        description: null,
        domain: 'example.com',
        enabled: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains',
      expect.objectContaining({
        body: JSON.stringify({
          description: null,
          domain: 'example.com',
          enabled: true,
        }),
        method: 'POST',
      })
    );
  });

  it('updates and deletes domains through encoded apps/web API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    await updateAIWhitelistDomain(
      'example.com',
      { enabled: false },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteAIWhitelistDomain('example.com', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

describe('AI whitelist email internal API helpers', () => {
  it('lists emails through the apps/web API with pagination filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listAIWhitelistEmails(
      { page: 2, pageSize: 20, q: 'person@example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/emails?page=2&pageSize=20&q=person%40example.com',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates emails through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          created_at: '2026-05-19T00:00:00Z',
          email: 'person@example.com',
          enabled: true,
        },
      })
    );

    await createAIWhitelistEmail(
      {
        email: 'person@example.com',
        enabled: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/emails',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'person@example.com',
          enabled: true,
        }),
        method: 'POST',
      })
    );
  });

  it('updates and deletes emails through encoded apps/web API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    await updateAIWhitelistEmail(
      'person@example.com',
      { enabled: false },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteAIWhitelistEmail('person@example.com', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/person%40example.com',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/person%40example.com',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

describe('AI gateway model internal API helpers', () => {
  it('lists a searchable paginated model page through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [
          {
            context_window: 1_000_000,
            description: 'Stable Flash Lite',
            id: 'google/gemini-3.1-flash-lite',
            is_enabled: true,
            name: 'Gemini 3.1 Flash Lite',
            provider: 'google',
            tags: ['thinking'],
          },
        ],
        pagination: { limit: 25, page: 2, total: 51 },
      })
    );

    const page = await listAiGatewayModelsPage(
      {
        enabled: true,
        ids: ['google/gemini-3.1-flash-lite'],
        limit: 25,
        page: 2,
        provider: 'google',
        q: 'flash',
        tag: 'thinking',
        type: 'language',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/models?enabled=true&format=paginated&ids=google%2Fgemini-3.1-flash-lite&limit=25&page=2&provider=google&q=flash&tag=thinking&type=language',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(page).toEqual({
      data: [
        {
          context: 1_000_000,
          description: 'Stable Flash Lite',
          disabled: false,
          label: 'Gemini 3.1 Flash Lite',
          provider: 'google',
          tags: ['thinking'],
          value: 'google/gemini-3.1-flash-lite',
        },
      ],
      pagination: { limit: 25, page: 2, total: 51 },
    });
  });
});

describe('AI agent internal API helpers', () => {
  it('lists AI agents through the apps/web infrastructure API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ agents: [], identities: [] }));

    await listAiAgents({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('saves AI agent registry payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        agent: { channels: [], id: 'support' },
      })
    );
    const payload = {
      enabled: true,
      id: 'support',
      name: 'Support Agent',
    };

    await saveAiAgent(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('routes deploy, pause, test, and rotate actions through encoded paths', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true, response: 'ok' }));

    await deployAiAgentChannel('agent/id', 'discord/main', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await pauseAiAgentChannel('agent/id', 'discord/main', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await testAiAgentChannel('agent/id', 'discord/main', 'ping', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await rotateAiAgentChannelSecret(
      'agent/id',
      'zalo/main',
      'webhookSecret',
      undefined,
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/deploy',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/pause',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/test',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main', prompt: 'ping' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/channels/zalo%2Fmain/secrets',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'webhookSecret',
          value: undefined,
        }),
        method: 'POST',
      })
    );
  });

  it('saves Zalo identity links through the AI agent API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        identity: { platformUserId: 'platform-user-1' },
      })
    );
    const payload = {
      externalUserId: 'zalo-user-1',
      platformUserId: 'platform-user-1',
      provider: 'zalo' as const,
      providerAccountId: 'oa-1',
      workspaceId: 'workspace-1',
    };

    await saveAiAgentIdentityLink(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents/identities',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
