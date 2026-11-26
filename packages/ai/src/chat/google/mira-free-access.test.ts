import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PERSONAL_WS_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '5d9feade-803b-4b3f-abd4-fa975b84c527';

const mocks = vi.hoisted(() => ({
  beginPersistence: vi.fn().mockResolvedValue({ lease: null, response: null }),
  creditPreflight: vi.fn(),
  persistUserMessage: vi.fn().mockResolvedValue(null),
  prepareMiraRuntime: vi.fn(),
  resolvePlanModel: vi.fn(),
  streamText: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: PERSONAL_WS_ID },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: CHAT_ID },
                error: null,
              }),
            }),
          }),
        }),
      };
    }),
  }),
}));

vi.mock('../../memory', () => ({ withAiMemory: mocks.withAiMemory }));
vi.mock('../../credits/resolve-plan-model', () => ({
  PlanModelResolutionError: class extends Error {},
  resolvePlanModel: mocks.resolvePlanModel,
}));
vi.mock('./route-credits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./route-credits')>()),
  performCreditPreflight: mocks.creditPreflight,
}));
vi.mock('./route-auth', () => ({
  authorizeAiWorkspace: async () => ({ ok: true, wsId: PERSONAL_WS_ID }),
  isInternalTuturuuuAiUser: async () => false,
  resolveAiRouteAuth: vi.fn(),
}));
vi.mock('./route-chat-resolution', () => ({
  moveTempFilesToThread: async () => null,
  resolveChatIdForUser: async () => ({ chatId: CHAT_ID }),
}));
vi.mock('./route-message-preparation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./route-message-preparation')>()),
  extractLatestUserMessageContent: () => 'List three short tasks',
  persistLatestUserMessage: mocks.persistUserMessage,
  persistRequestScopedUserMessage: async () => null,
  prepareProcessedMessages: async () => ({
    processedMessages: [{ content: 'List three short tasks', role: 'user' }],
  }),
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

describe('free personal Mira chat route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlanModel.mockResolvedValue({
      allocationId: 'free-allocation',
      modelId: 'google/gemini-3.1-flash-lite',
      source: 'requested',
      tier: 'FREE',
    });
    mocks.prepareMiraRuntime.mockResolvedValue({
      miraSystemPrompt: 'You are Mira.',
      miraTools: undefined,
    });
    mocks.withAiMemory.mockResolvedValue({ modelId: 'gemini-3.1-flash-lite' });
    mocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('stream', { status: 200 }),
    });
  });

  it('allows an external Free account to send a personal Mira chat within its allowance', async () => {
    mocks.creditPreflight.mockResolvedValue({
      cappedMaxOutput: 4096,
      tier: 'FREE',
    });
    const handler = createPOST({
      resolveAuth: async () => ({
        ok: true,
        supabase: {} as never,
        user: { email: 'app-review@tutur3u.com', id: 'free-user-1' } as never,
      }),
    });

    const response = await handler(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          creditSource: 'personal',
          id: CHAT_ID,
          isMiraMode: true,
          messages: [
            {
              parts: [{ text: 'List three short tasks', type: 'text' }],
              role: 'user',
            },
          ],
          model: 'google/gemini-3.1-flash-lite',
          wsId: PERSONAL_WS_ID,
        }),
      }) as NextRequest
    );

    expect(response.status).toBe(200);
    expect(mocks.creditPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-3.1-flash-lite',
        userId: 'free-user-1',
        wsId: PERSONAL_WS_ID,
      })
    );
    expect(mocks.prepareMiraRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        isMiraMode: true,
        restrictToPersonalWorkspace: true,
        userId: 'free-user-1',
        wsId: PERSONAL_WS_ID,
      })
    );
    expect(mocks.streamText).toHaveBeenCalledTimes(1);
  });

  it('returns 403 with structured code when Free credit allowance is exhausted', async () => {
    mocks.creditPreflight.mockResolvedValue({
      error: Response.json(
        {
          code: 'CREDITS_EXHAUSTED',
          error: 'AI credits have been used up',
        },
        { status: 403 }
      ),
    });
    const handler = createPOST({
      resolveAuth: async () => ({
        ok: true,
        supabase: {} as never,
        user: { email: 'app-review@tutur3u.com', id: 'free-user-1' } as never,
      }),
    });

    const response = await handler(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          creditSource: 'personal',
          id: CHAT_ID,
          isMiraMode: true,
          messages: [
            {
              parts: [{ text: 'List three short tasks', type: 'text' }],
              role: 'user',
            },
          ],
          model: 'google/gemini-3.1-flash-lite',
          wsId: PERSONAL_WS_ID,
        }),
      }) as NextRequest
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'CREDITS_EXHAUSTED',
      error: 'AI credits have been used up',
    });
    expect(mocks.streamText).not.toHaveBeenCalled();
  });
});
