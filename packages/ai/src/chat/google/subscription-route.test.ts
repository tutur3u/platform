import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creditPreflight: vi.fn(),
  resolvePlanModel: vi.fn(),
  withAiMemory: vi.fn(),
  streamText: vi.fn(),
  prepareMiraRuntime: vi.fn(),
  beginPersistence: vi.fn().mockResolvedValue({ lease: null, response: null }),
  persistUserMessage: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('../../memory', () => ({ withAiMemory: mocks.withAiMemory }));
vi.mock('../../credits/resolve-plan-model', () => ({
  resolvePlanModel: mocks.resolvePlanModel,
  PlanModelResolutionError: class extends Error {},
}));
vi.mock('./route-credits', () => ({
  performCreditPreflight: mocks.creditPreflight,
}));
vi.mock('./route-auth', () => ({
  authorizeAiWorkspace: async () => ({
    ok: true,
    wsId: '11111111-1111-4111-8111-111111111111',
  }),
  resolveAiRouteAuth: vi.fn(),
  isInternalTuturuuuAiUser: vi.fn(),
}));
vi.mock('./route-chat-resolution', () => ({
  resolveChatIdForUser: async () => ({
    chatId: '22222222-2222-4222-8222-222222222222',
  }),
  moveTempFilesToThread: async () => null,
}));
vi.mock('./route-message-preparation', () => ({
  prepareProcessedMessages: async () => ({
    processedMessages: [{ role: 'user', content: 'Hello' }],
  }),
  splitSystemMessages: (messages: unknown) => ({ messages, system: [] }),
  persistLatestUserMessage: mocks.persistUserMessage,
  persistRequestScopedUserMessage: async () => null,
  extractLatestUserMessageContent: () => 'Hello',
  mergeSystemInstructions: () => 'Instructions',
}));
vi.mock('./route-mira-runtime', () => ({
  prepareMiraRuntime: mocks.prepareMiraRuntime,
}));
vi.mock('./request-persistence-lease', () => ({
  beginAiPersistenceRequest: mocks.beginPersistence,
  createAiPersistenceFinisher: () => vi.fn(),
  releaseAiPersistenceRequest: vi.fn(),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.streamText,
}));

import { createPOST } from './route';

describe('subscription chat billing boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses the injected subscription model with no credit or memory-provider calls', async () => {
    const model = { modelId: 'synthetic-account-model' } as never;
    const resolveModel = vi.fn().mockResolvedValue(model);
    mocks.prepareMiraRuntime.mockResolvedValue({ miraTools: undefined });
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream'),
    });
    const handler = createPOST({
      subscription: { resolveModel, onError: () => 'Subscription unavailable' },
      resolveAuth: async () => ({
        ok: true,
        supabase: {} as never,
        user: { id: 'synthetic-user' } as never,
      }),
    });
    const response = await handler(
      new Request('http://localhost/api/ai/chatgpt', {
        method: 'POST',
        body: JSON.stringify({
          model: 'chatgpt/oaiapp_test/account-model',
          isMiraMode: true,
          messages: [
            { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
          ],
        }),
      }) as NextRequest
    );
    expect(response.status).toBe(200);
    expect(resolveModel).toHaveBeenCalledWith(
      'synthetic-user',
      'chatgpt/oaiapp_test/account-model'
    );
    expect(mocks.creditPreflight).not.toHaveBeenCalled();
    expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
    expect(mocks.withAiMemory).not.toHaveBeenCalled();
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ model, tools: undefined })
    );
    expect(mocks.streamText.mock.calls[0]?.[0]).not.toHaveProperty(
      'maxOutputTokens'
    );
    expect(mocks.prepareMiraRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ isMiraMode: false })
    );
  });
  it('fails closed when the selected connection is unavailable', async () => {
    const handler = createPOST({
      subscription: {
        resolveModel: async () => {
          throw new Error('Unavailable');
        },
        onError: () => 'Subscription unavailable',
      },
      resolveAuth: async () => ({
        ok: true,
        supabase: {} as never,
        user: { id: 'synthetic-user' } as never,
      }),
    });
    const response = await handler(
      new Request('http://localhost/api/ai/chatgpt', {
        method: 'POST',
        body: JSON.stringify({
          model: 'chatgpt/oaiapp_test/account-model',
          messages: [],
        }),
      }) as NextRequest
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Subscription unavailable',
      code: 'CHATGPT_CONNECTION_REQUIRED',
    });
  });
  it.each([
    'chatgpt/oaiapp_test/account-model',
    ' chatgpt/oaiapp_test/account-model ',
    ' ChatGPT/oaiapp_test/account-model ',
  ])(
    'rejects subscription ID %s on the funded route before effects',
    async (selectedModel) => {
      const resolveAuth = vi.fn();
      const response = await createPOST({
        serverAPIKeyFallback: true,
        resolveAuth,
      })(
        new Request('http://localhost/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            model: selectedModel,
            wsId: '11111111-1111-4111-8111-111111111111',
            messages: [
              { role: 'user', parts: [{ type: 'text', text: 'Synthetic' }] },
            ],
          }),
        }) as NextRequest
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'CHATGPT_ROUTE_REQUIRED',
      });
      expect(mocks.creditPreflight).not.toHaveBeenCalled();
      expect(mocks.resolvePlanModel).not.toHaveBeenCalled();
      expect(mocks.streamText).not.toHaveBeenCalled();
      expect(resolveAuth).not.toHaveBeenCalled();
      expect(mocks.withAiMemory).not.toHaveBeenCalled();
      expect(mocks.beginPersistence).not.toHaveBeenCalled();
      expect(mocks.persistUserMessage).not.toHaveBeenCalled();
    }
  );
});
