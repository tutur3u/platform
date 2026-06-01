import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  deductAiCredits: vi.fn(),
  gateway: vi.fn(),
  getPermissions: vi.fn(),
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
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
  verifyWorkspaceMembershipType: vi.fn(async () => ({ ok: true })),
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

vi.mock('../credits/check-credits', () => ({
  deductAiCredits: (...args: Parameters<typeof mocks.deductAiCredits>) =>
    mocks.deductAiCredits(...args),
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

function createAcceptedCallbacks({
  email = 'dev@tuturuuu.com',
}: {
  email?: string;
} = {}): MindRouteCallbacks {
  return {
    ...createAuthRejectedCallbacks(),
    ensureThread: async () => '00000000-0000-4000-8000-000000000001',
    listBoards: async () => [],
    persistMessage: async () => {},
    resolveAccess: async () => ({ ok: true, wsId: 'workspace-1' }),
    resolveAuth: async () => ({
      ok: true,
      supabase: {} as never,
      user: { email, id: 'user-1' } as never,
    }),
  };
}

describe('mind route payload validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({});
    mocks.deductAiCredits.mockResolvedValue({
      creditsDeducted: 1,
      error: null,
      remainingCredits: 999,
    });
    mocks.google.mockImplementation((modelId: string) => ({
      modelId,
      provider: 'google',
    }));
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
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
    expect(streamOptions?.system).toContain('Plan completeness standard');
    expect(streamOptions?.system).toContain('create_node operations before');
    expect(streamOptions?.system).toContain('Existing graph is authoritative');
    expect(streamOptions?.system).toContain('one applyable draft patch');
    expect(streamOptions?.system).toContain('orphaned nodes');
  });

  it('normalizes legacy Gemini 3.1 Flash Lite preview requests before streaming', async () => {
    mocks.resolvePlanModel.mockResolvedValueOnce({
      allocationId: 'allocation-1',
      modelId: 'google/gemini-3.1-flash-lite',
      source: 'requested',
      tier: 'PRO',
    });
    const route = createPOST(createAcceptedCallbacks());

    const response = await route(
      createRequest({
        boardId: null,
        messages: [],
        model: 'google/gemini-3.1-flash-lite-preview',
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'personal',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('stream ok');
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedModel: 'google/gemini-3.1-flash-lite',
      })
    );
    expect(mocks.google).toHaveBeenCalledWith('gemini-3.1-flash-lite');
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it('allows non-internal users and deducts from personal credits', async () => {
    const personalWorkspaceQuery = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'personal-workspace-1',
        },
        error: null,
      }),
      select: vi.fn().mockReturnThis(),
    };
    const sbAdmin = {
      from: vi.fn(() => personalWorkspaceQuery),
    };
    mocks.createAdminClient.mockResolvedValue(sbAdmin);

    const route = createPOST(
      createAcceptedCallbacks({ email: 'member@example.com' })
    );

    const response = await route(
      createRequest({
        boardId: null,
        creditSource: 'personal',
        messages: [
          { parts: [{ text: 'plan this', type: 'text' }], role: 'user' },
        ],
        model: 'google/gemini-2.5-flash',
        threadId: '00000000-0000-4000-8000-000000000001',
        wsId: 'workspace-1',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('stream ok');
    expect(mocks.resolvePlanModel).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: 'personal-workspace-1',
      })
    );
    expect(mocks.performCreditPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        wsId: 'personal-workspace-1',
      })
    );

    const streamOptions = mocks.streamText.mock.calls[0]?.[0];
    await streamOptions?.onFinish?.({
      finishReason: 'stop',
      steps: [],
      text: 'Done',
      totalUsage: {
        inputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 3,
        totalTokens: 33,
      },
      usage: undefined,
    } as never);

    expect(mocks.deductAiCredits).toHaveBeenCalledWith({
      feature: 'chat',
      inputTokens: 10,
      modelId: 'google/gemini-2.5-flash',
      outputTokens: 20,
      reasoningTokens: 3,
      userId: 'user-1',
      wsId: 'personal-workspace-1',
    });
  });
});
