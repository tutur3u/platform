import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createChatIntegrationChannel: vi.fn(),
  requireAiAgentAdmin: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/lib/ai-agents/chat-integrations', () => ({
  createChatIntegrationChannel: (...args: unknown[]) =>
    mocks.createChatIntegrationChannel(...args),
}));

vi.mock('../access', () => ({
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

async function callRoute(body: Record<string, unknown> = {}) {
  const { POST } = await import('./route');
  const request = new Request(
    'http://localhost/api/v1/infrastructure/ai-agents/chat-integrations',
    {
      body: JSON.stringify(body),
      method: 'POST',
    }
  ) as unknown as NextRequest;
  Object.assign(request, {
    nextUrl: new URL(
      'http://localhost/api/v1/infrastructure/ai-agents/chat-integrations'
    ),
  });

  return POST(request);
}

describe('chat integrations AI-agent route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAiAgentAdmin.mockResolvedValue({
      ok: true,
      sbAdmin: { id: 'admin-client' },
      user: { id: 'user-1' },
    });
    mocks.createChatIntegrationChannel.mockResolvedValue({
      agent: {
        channels: [],
        id: 'chat-integrations',
      },
      channel: {
        id: 'chat-zalo-personal',
        secrets: [
          {
            configured: true,
            lastFour: 'json',
            name: 'personalCookieJson',
          },
        ],
      },
      conversationId: 'ai-agent-chat-integrations-chat-zalo-personal',
    });
  });

  it('rejects callers without AI-agent admin access', async () => {
    mocks.requireAiAgentAdmin.mockResolvedValue({
      ok: false,
      response: new Response('forbidden', { status: 403 }),
    });

    const response = await callRoute({ kind: 'discord' });

    expect(response.status).toBe(403);
    expect(mocks.createChatIntegrationChannel).not.toHaveBeenCalled();
  });

  it('rejects invalid integration kinds', async () => {
    const response = await callRoute({ kind: 'telegram' });

    expect(response.status).toBe(400);
    expect(mocks.createChatIntegrationChannel).not.toHaveBeenCalled();
  });

  it('creates managed integration channels without returning raw secrets', async () => {
    const response = await callRoute({
      displayName: 'Personal Zalo',
      kind: 'zalo-personal',
    });

    expect(response.status).toBe(201);
    expect(mocks.createChatIntegrationChannel).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      db: { id: 'admin-client' },
      displayName: 'Personal Zalo',
      kind: 'zalo-personal',
      origin: 'http://localhost',
    });
    const payload = await response.json();
    expect(payload).toMatchObject({
      channel: {
        id: 'chat-zalo-personal',
        secrets: [
          {
            configured: true,
            lastFour: 'json',
            name: 'personalCookieJson',
          },
        ],
      },
      conversationId: 'ai-agent-chat-integrations-chat-zalo-personal',
    });
    const responseText = JSON.stringify(payload);
    expect(responseText).not.toContain('personalCookieJson=');
    expect(responseText).not.toContain('personalImei=');
    expect(responseText).not.toContain('personalUserAgent=');
  });
});
