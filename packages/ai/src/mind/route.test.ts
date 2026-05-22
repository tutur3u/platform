import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  gateway: vi.fn(),
  google: vi.fn(),
  performCreditPreflight: vi.fn(),
  prepareProcessedMessages: vi.fn(),
  resolvePlanModel: vi.fn(),
  stepCountIs: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();

  return {
    ...actual,
    gateway: (...args: Parameters<typeof mocks.gateway>) =>
      mocks.gateway(...args),
    stepCountIs: (...args: Parameters<typeof mocks.stepCountIs>) =>
      mocks.stepCountIs(...args),
    streamText: (...args: Parameters<typeof mocks.streamText>) =>
      mocks.streamText(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('../chat/google/route-credits', () => ({
  performCreditPreflight: (
    ...args: Parameters<typeof mocks.performCreditPreflight>
  ) => mocks.performCreditPreflight(...args),
}));

vi.mock('../chat/google/route-message-preparation', () => ({
  prepareProcessedMessages: (
    ...args: Parameters<typeof mocks.prepareProcessedMessages>
  ) => mocks.prepareProcessedMessages(...args),
}));

vi.mock('../credits/resolve-plan-model', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../credits/resolve-plan-model')>();

  return {
    ...actual,
    resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
      mocks.resolvePlanModel(...args),
  };
});

import { createPOST, type MindRouteCallbacks } from './route';

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/mind', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

function createAuthRejectedCallbacks(): MindRouteCallbacks {
  return {
    applyPatch: async () => null,
    createPatch: async () => null,
    ensureThread: async () => '00000000-0000-4000-8000-000000000001',
    getSnapshot: async () => null,
    listBoards: async () => [],
    persistMessage: async () => {},
    resolveAccess: async () => ({
      ok: false,
      response: new Response('access failed', { status: 403 }),
    }),
    resolveAuth: async () => ({
      ok: false,
      response: new Response('auth failed', { status: 401 }),
    }),
    searchNodes: async () => [],
  };
}

function createAcceptedCallbacks(): MindRouteCallbacks {
  return {
    ...createAuthRejectedCallbacks(),
    ensureThread: async () => '00000000-0000-4000-8000-000000000001',
    listBoards: async () => [],
    persistMessage: async () => {},
    resolveAccess: async () => ({ ok: true, wsId: 'workspace-1' }),
    resolveAuth: async () => ({
      ok: true,
      supabase: {} as never,
      user: { email: 'dev@tuturuuu.com', id: 'user-1' } as never,
    }),
  };
}

describe('mind route payload validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({});
    mocks.google.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'google',
    }));
    mocks.performCreditPreflight.mockResolvedValue({ cappedMaxOutput: null });
    mocks.prepareProcessedMessages.mockResolvedValue({
      processedMessages: [{ content: 'plan this', role: 'user' }],
    });
    mocks.resolvePlanModel.mockResolvedValue({
      allocationId: 'allocation-1',
      modelId: 'google/gemini-2.5-flash',
      source: 'requested',
      tier: 'PRO',
    });
    mocks.stepCountIs.mockReturnValue('stop-after-steps');
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream ok'),
    });
  });

  it('accepts legacy null board ids before resolving auth', async () => {
    const route = createPOST(createAuthRejectedCallbacks());

    const response = await route(
      createRequest({
        boardId: null,
        messages: [],
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('auth failed');
  });

  it('rejects malformed board ids', async () => {
    const route = createPOST(createAuthRejectedCallbacks());

    const response = await route(
      createRequest({
        boardId: 'not-a-board-id',
        messages: [],
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid Mind AI payload',
    });
  });

  it('streams Google models through the native Google provider', async () => {
    const route = createPOST(createAcceptedCallbacks());

    const response = await route(
      createRequest({
        boardId: null,
        messages: [],
        model: 'google/gemini-2.5-flash',
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('stream ok');
    expect(mocks.google).toHaveBeenCalledWith('gemini-2.5-flash');
    expect(mocks.gateway).not.toHaveBeenCalled();

    const streamOptions = mocks.streamText.mock.calls[0]?.[0];
    expect(streamOptions).toMatchObject({
      model: {
        modelId: 'gemini-2.5-flash',
        provider: 'google',
      },
      providerOptions: {
        google: expect.any(Object),
      },
    });
    expect(streamOptions?.providerOptions).not.toHaveProperty('gateway');
    expect(streamOptions?.providerOptions).not.toHaveProperty('vertex');
  });
});
